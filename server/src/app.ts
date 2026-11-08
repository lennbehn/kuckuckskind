import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CLOSE_CODES,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ConfigOverride,
  type ErrorCode,
  type ServerMessage,
} from '@kuckuckskind/shared';
import type { Env } from './env.ts';
import type { Logger } from './log.ts';
import { RoomError } from './rooms/errors.ts';
import { RoomManager, hashToken } from './rooms/manager.ts';
import type { Room } from './rooms/room.ts';
import { MemoryRoomStore, type RoomStore } from './rooms/store.ts';
import { createAdminAuth, type AdminAuth } from './admin/auth.ts';
import { createAdminApi } from './admin/http.ts';
import { MemoryPresetStore, type PresetStore } from './admin/presets.ts';

export interface AppOptions {
  env: Env;
  log: Logger;
  store?: RoomStore;
  presets?: PresetStore;
  /** Admin-Anmeldung; Standard aus der Umgebung (Cognito bzw. lokal Passwort). */
  auth?: AdminAuth;
  /** Uhr für Tests austauschbar. */
  now?: () => number;
  /** Abstand der WebSocket-Pings gegen tote Verbindungen. */
  heartbeatMs?: number;
  /** Nachrichten pro Sekunde je Verbindung (Dauer), Spitze = doppelt. */
  rateLimitPerSecond?: number;
}

export interface App {
  http: Server;
  wss: WebSocketServer;
  rooms: RoomManager;
  close(): Promise<void>;
}

interface Connection {
  socket: WebSocket;
  token: string | null;
  tokenHash: string | null;
  alive: boolean;
  tokens: number;
  refilledAt: number;
}

export const WS_PATH = '/ws';

/** HTTP-Server mit Health-Check und WebSocket-Endpunkt für Räume und Uhrabgleich. */
export function createApp({
  env,
  log,
  store = new MemoryRoomStore(),
  presets = new MemoryPresetStore(),
  auth = createAdminAuth(env, log),
  now = Date.now,
  heartbeatMs = 25_000,
  rateLimitPerSecond = 20,
}: AppOptions): App {
  const startedAt = now();

  /** Aktive Verbindung je Sitzung (Token-Hash). */
  const bySession = new Map<string, Connection>();
  const connections = new Set<Connection>();

  const rooms = new RoomManager({
    store,
    log,
    now,
    onRoomChanged: (room) => broadcast(room),
    onPlayerRemoved: (_room, player, reason) => {
      const conn = bySession.get(player.tokenHash);
      if (conn) send(conn, { type: 'room.closed', reason });
    },
  });

  const adminApi = createAdminApi({ rooms, presets, auth, log });

  const http = createServer((req, res) => {
    void adminApi(req, res).then((handled) => {
      if (!handled) handleHttp(req, res);
    });
  });

  function handleHttp(req: IncomingMessage, res: ServerResponse) {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(
        JSON.stringify({
          ok: true,
          stage: env.STAGE,
          uptimeMs: now() - startedAt,
          rooms: rooms.rooms.size,
          connections: connections.size,
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }

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

  wss.on('connection', (socket) => {
    const conn: Connection = {
      socket,
      token: null,
      tokenHash: null,
      alive: true,
      tokens: rateLimitPerSecond * 2,
      refilledAt: now(),
    };
    connections.add(conn);
    socket.on('pong', () => (conn.alive = true));
    socket.on('close', () => onClose(conn));
    socket.on('error', (err) => log.warn('socket-fehler', { err: String(err) }));
    socket.on('message', (data, isBinary) => {
      const receivedAt = now();
      if (!takeToken(conn, receivedAt)) {
        return sendError(conn, 'rate_limited', 'Zu viele Nachrichten');
      }
      if (isBinary) return sendError(conn, 'bad_message', 'Nur Text-Nachrichten');
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return sendError(conn, 'bad_message', parsed.error);
      try {
        handleMessage(conn, parsed.message, receivedAt);
      } catch (err) {
        if (err instanceof RoomError) return sendError(conn, err.code, err.message);
        log.error('fehler bei nachricht', { type: parsed.message.type, err: String(err) });
        sendError(conn, 'internal', 'Interner Fehler');
      }
    });
  });

  function takeToken(conn: Connection, t: number): boolean {
    const max = rateLimitPerSecond * 2;
    conn.tokens = Math.min(max, conn.tokens + ((t - conn.refilledAt) / 1000) * rateLimitPerSecond);
    conn.refilledAt = t;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  function send(conn: Connection, msg: ServerMessage) {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(msg));
  }

  function sendError(conn: Connection, code: ErrorCode, message: string) {
    send(conn, { type: 'error', code, message });
  }

  function broadcast(room: Room) {
    for (const player of room.players.values()) {
      const conn = bySession.get(player.tokenHash);
      if (conn) send(conn, { type: 'room.state', room: room.viewFor(player.id) });
    }
  }

  function sendRoom(conn: Connection) {
    const session = conn.tokenHash ? rooms.sessionFor(conn.tokenHash) : null;
    if (session) send(conn, { type: 'room.state', room: session.room.viewFor(session.playerId) });
  }

  function onClose(conn: Connection) {
    connections.delete(conn);
    if (!conn.tokenHash || bySession.get(conn.tokenHash) !== conn) return;
    bySession.delete(conn.tokenHash);
    const session = rooms.sessionFor(conn.tokenHash);
    session?.room.setConnected(session.playerId, false);
  }

  function handleMessage(conn: Connection, msg: ClientMessage, receivedAt: number) {
    // Uhrabgleich ist auch vor dem Handshake erlaubt – so früh wie möglich messen.
    if (msg.type === 'time.ping') {
      return send(conn, {
        type: 'time.pong',
        clientSentAt: msg.clientSentAt,
        serverReceivedAt: receivedAt,
        serverSentAt: now(),
      });
    }

    if (msg.type === 'hello') return onHello(conn, msg);

    if (!conn.tokenHash) throw new RoomError('not_ready', 'Erst hello senden');
    const tokenHash = conn.tokenHash;

    switch (msg.type) {
      case 'room.create': {
        rooms.create(msg.name, tokenHash);
        return sendRoom(conn);
      }
      case 'room.join': {
        rooms.join(msg.roomCode, msg.name, tokenHash);
        return sendRoom(conn);
      }
      case 'room.leave': {
        rooms.leave(tokenHash);
        return send(conn, { type: 'room.closed', reason: 'left' });
      }
    }

    const session = rooms.sessionFor(tokenHash);
    if (!session) throw new RoomError('room_not_found', 'Du bist in keinem Raum.');
    const { room, playerId } = session;

    switch (msg.type) {
      case 'lobby.seating':
        return room.setSeating(playerId, msg.order);
      case 'lobby.settings':
        return room.updateSettings(playerId, msg.settings);
      case 'lobby.kick':
        return room.kick(playerId, msg.playerId);
      case 'game.start':
        return room.start(playerId);
      case 'game.control':
        return room.control(playerId, msg.action);
      case 'hatch.progress':
        return room.recordHatch(playerId, msg.kind, msg.method);
      case 'device.calibration':
        return room.setCalibration(playerId, msg.calibration);
      case 'peek.choose':
        return room.choosePeek(playerId, msg.targetId);
      case 'chick.report':
        return room.reportChick(playerId, msg.report);
      case 'chick.station':
        return room.recordStation(playerId, msg.stats);
      case 'vote.cast':
        return room.castVote(playerId, msg.targetId);
      case 'device.levels':
        return room.setLevels(playerId, msg.levels);
      case 'lobby.preset':
        return void choosePreset(conn, room, playerId, msg.presetId);
      case 'module.message':
        throw new RoomError('not_allowed', `Modul „${msg.moduleId}“ ist nicht aktiv`);
    }
  }

  /** Host wählt in der Lobby ein Preset (neueste Version) oder die Standardwerte. */
  async function choosePreset(
    conn: Connection,
    room: Room,
    playerId: string,
    presetId: string | null,
  ) {
    try {
      if (room.hostId !== playerId) throw new RoomError('not_allowed', 'Nur der Host darf das.');
      if (presetId === null) return room.applyPreset({}, null);
      const preset = await presets.get(presetId);
      if (!preset) throw new RoomError('bad_message', 'Preset nicht gefunden.');
      room.applyPreset(preset.override as ConfigOverride, {
        presetId: preset.presetId,
        name: preset.name,
        version: preset.version,
      });
    } catch (err) {
      if (err instanceof RoomError) sendError(conn, err.code, err.message);
      else {
        log.error('preset laden fehlgeschlagen', { err: String(err) });
        sendError(conn, 'internal', 'Preset konnte nicht geladen werden.');
      }
    }
  }

  function onHello(conn: Connection, msg: Extract<ClientMessage, { type: 'hello' }>) {
    if (msg.protocol !== PROTOCOL_VERSION) {
      sendError(conn, 'protocol_mismatch', `Server spricht Protokoll ${PROTOCOL_VERSION}`);
      conn.socket.close(CLOSE_CODES.protocolMismatch, 'protocol_mismatch');
      return;
    }
    // Bekanntes Token → Sitzung fortsetzen; sonst neues Token ausgeben.
    const known = msg.sessionToken ? rooms.sessionFor(hashToken(msg.sessionToken)) : null;
    const token = known && msg.sessionToken ? msg.sessionToken : newSessionToken();
    const tokenHash = hashToken(token);

    // Gleiche Sitzung auf anderer Verbindung (zweiter Tab, alte Verbindung) ablösen.
    const previous = bySession.get(tokenHash);
    if (previous && previous !== conn) {
      previous.tokenHash = null;
      previous.socket.close(CLOSE_CODES.replaced, 'replaced');
    }
    if (conn.tokenHash && conn.tokenHash !== tokenHash) bySession.delete(conn.tokenHash);

    conn.token = token;
    conn.tokenHash = tokenHash;
    bySession.set(tokenHash, conn);
    log.info('hello', { device: msg.device, resumed: !!known, room: known?.room.code });
    send(conn, {
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      sessionToken: token,
      resumed: !!known,
      serverTime: now(),
    });
    if (known) {
      known.room.setConnected(known.playerId, true);
      sendRoom(conn);
    }
  }

  const heartbeat = setInterval(() => {
    for (const conn of connections) {
      if (!conn.alive) {
        conn.socket.terminate();
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
    rooms,
    async close() {
      clearInterval(heartbeat);
      await rooms.flush();
      rooms.dispose();
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
