import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@kuckuckskind/shared';
import type { Env } from './env.ts';
import type { Logger } from './log.ts';

export interface AppOptions {
  env: Env;
  log: Logger;
  /** Uhr für Tests austauschbar. */
  now?: () => number;
  /** Abstand der WebSocket-Pings gegen tote Verbindungen. */
  heartbeatMs?: number;
}

export interface App {
  http: Server;
  wss: WebSocketServer;
  close(): Promise<void>;
}

interface Connection {
  socket: WebSocket;
  sessionToken: string | null;
  alive: boolean;
}

export const WS_PATH = '/ws';

/**
 * HTTP-Server mit Health-Check und WebSocket-Endpunkt.
 * Räume und Spiel-Automat folgen in M2; hier: Handshake, Uhrabgleich, Fehlerbehandlung.
 */
export function createApp({ env, log, now = Date.now, heartbeatMs = 25_000 }: AppOptions): App {
  const startedAt = now();

  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, stage: env.STAGE, uptimeMs: now() - startedAt }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH || !originAllowed(req, env.ALLOWED_ORIGINS)) {
      log.warn('upgrade abgelehnt', { path, origin: req.headers.origin });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const connections = new Set<Connection>();

  wss.on('connection', (socket) => {
    const conn: Connection = { socket, sessionToken: null, alive: true };
    connections.add(conn);
    socket.on('pong', () => (conn.alive = true));
    socket.on('close', () => connections.delete(conn));
    socket.on('error', (err) => log.warn('socket-fehler', { err: String(err) }));
    socket.on('message', (data, isBinary) => {
      const receivedAt = now();
      if (isBinary) return sendError(conn, 'bad_message', 'Nur Text-Nachrichten');
      handleMessage(conn, data.toString(), receivedAt);
    });
  });

  function send(conn: Connection, msg: ServerMessage) {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(msg));
  }

  function sendError(conn: Connection, code: ErrorCode, message: string) {
    send(conn, { type: 'error', code, message });
  }

  function handleMessage(conn: Connection, raw: string, receivedAt: number) {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return sendError(conn, 'bad_message', parsed.error);
    const msg = parsed.message;

    // Uhrabgleich ist auch vor dem Handshake erlaubt – so früh wie möglich messen.
    if (msg.type === 'time.ping') {
      return send(conn, {
        type: 'time.pong',
        clientSentAt: msg.clientSentAt,
        serverReceivedAt: receivedAt,
        serverSentAt: now(),
      });
    }

    if (msg.type === 'hello') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        sendError(conn, 'protocol_mismatch', `Server spricht Protokoll ${PROTOCOL_VERSION}`);
        conn.socket.close(4000, 'protocol_mismatch');
        return;
      }
      // Wiederaufnahme mit gespeicherten Sitzungen folgt in M2 (Räume).
      const resumed = false;
      conn.sessionToken = msg.sessionToken ?? newSessionToken();
      log.info('hello', { device: msg.device, resumed });
      return send(conn, {
        type: 'welcome',
        protocol: PROTOCOL_VERSION,
        sessionToken: conn.sessionToken,
        resumed,
        serverTime: now(),
      });
    }

    if (!conn.sessionToken) return sendError(conn, 'not_ready', 'Erst hello senden');

    if (msg.type === 'module.message') {
      return sendError(conn, 'not_allowed', `Modul „${msg.moduleId}“ ist nicht aktiv`);
    }
  }

  const heartbeat = setInterval(() => {
    for (const conn of connections) {
      if (!conn.alive) {
        conn.socket.terminate();
        connections.delete(conn);
        continue;
      }
      conn.alive = false;
      conn.socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return {
    http,
    wss,
    async close() {
      clearInterval(heartbeat);
      for (const conn of connections) conn.socket.close(1001, 'server_shutdown');
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function originAllowed(req: IncomingMessage, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const origin = req.headers.origin;
  return typeof origin === 'string' && allowed.includes(origin);
}

function newSessionToken(): string {
  return randomBytes(24).toString('base64url');
}
