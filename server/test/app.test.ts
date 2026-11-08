import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, parseServerMessage, type ServerMessage } from '@kuckuckskind/shared';
import { createApp, type App } from '../src/app.ts';
import { readEnv } from '../src/env.ts';
import { silentLogger } from '../src/log.ts';

let app: App;
let port: number;

async function start(envOverrides: Record<string, string> = {}) {
  app = createApp({ env: readEnv({ PORT: '0', ...envOverrides }), log: silentLogger });
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  port = (app.http.address() as AddressInfo).port;
}

function connect(headers: Record<string, string> = {}): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

function request(ws: WebSocket, msg: unknown): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      const parsed = parseServerMessage(data.toString());
      if (parsed.ok) resolve(parsed.message);
      else reject(new Error(parsed.error));
    });
    ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  });
}

describe('Server', () => {
  beforeEach(() => start());
  afterEach(() => app.close());

  it('antwortet auf den Health-Check', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stage: 'local' });
  });

  it('begrüßt Clients mit Sitzungs-Token', async () => {
    const ws = await connect();
    const reply = await request(ws, { type: 'hello', protocol: PROTOCOL_VERSION });
    expect(reply.type).toBe('welcome');
    if (reply.type === 'welcome') expect(reply.sessionToken.length).toBeGreaterThanOrEqual(16);
    ws.close();
  });

  it('beantwortet Uhr-Pings', async () => {
    const ws = await connect();
    const reply = await request(ws, { type: 'time.ping', clientSentAt: 123 });
    expect(reply).toMatchObject({ type: 'time.pong', clientSentAt: 123 });
    ws.close();
  });

  it('meldet ungültige Nachrichten', async () => {
    const ws = await connect();
    expect(await request(ws, 'kaputt')).toMatchObject({ type: 'error', code: 'bad_message' });
    expect(
      await request(ws, { type: 'module.message', moduleId: 'fox', payload: null }),
    ).toMatchObject({
      type: 'error',
      code: 'not_ready',
    });
    ws.close();
  });

  it('lehnt falsche Protokollversion ab', async () => {
    const ws = await connect();
    expect(await request(ws, { type: 'hello', protocol: 999 })).toMatchObject({
      code: 'protocol_mismatch',
    });
  });
});

describe('Origin-Prüfung', () => {
  beforeEach(() => start({ ALLOWED_ORIGINS: 'https://spiel.example' }));
  afterEach(() => app.close());

  it('lässt erlaubte Origins zu und lehnt andere ab', async () => {
    const ok = await connect({ origin: 'https://spiel.example' });
    ok.close();
    await expect(connect({ origin: 'https://boese.example' })).rejects.toThrow('403');
  });
});
