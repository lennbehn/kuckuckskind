import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import {
  ADMIN_TOKEN_HEADER,
  PROTOCOL_VERSION,
  parseServerMessage,
  type RoomDebug,
  type RoomView,
} from '@kuckuckskind/shared';
import { createApp, type App } from '../src/app.ts';
import { readEnv } from '../src/env.ts';
import { silentLogger } from '../src/log.ts';
import { MemoryPresetStore, slugify } from '../src/admin/presets.ts';

let app: App;
let base: string;
const TOKEN = 'dev:geheim';

beforeEach(async () => {
  app = createApp({
    env: readEnv({ PORT: '0', ADMIN_DEV_PASSWORD: 'geheim' }),
    log: silentLogger,
    presets: new MemoryPresetStore(),
  });
  await new Promise<void>((r) => app.http.listen(0, r));
  base = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
});
afterEach(() => app.close());

/** JSON-Antwort lesen (in Tests reicht eine lockere Typisierung). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response | Promise<Response>): Promise<any> => (await res).json();

const api = (path: string, init: RequestInit = {}, token: string | null = TOKEN) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { [ADMIN_TOKEN_HEADER]: token } : {}),
    },
  });

/** Spieler per WebSocket; liefert die jeweils neueste Raumansicht. */
async function player(name: string, join?: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  await new Promise((r) => ws.once('open', r));
  let latest: RoomView | null = null;
  const errors: string[] = [];
  ws.on('message', (d) => {
    const m = parseServerMessage(d.toString());
    if (!m.ok) return;
    if (m.message.type === 'room.state') latest = m.message.room;
    if (m.message.type === 'error') errors.push(m.message.message);
  });
  const send = (msg: unknown) => ws.send(JSON.stringify(msg));
  send({ type: 'hello', protocol: PROTOCOL_VERSION });
  send(join ? { type: 'room.join', roomCode: join, name } : { type: 'room.create', name });
  const until = async (pred: (r: RoomView) => boolean) => {
    for (let i = 0; i < 100; i++) {
      if (latest && pred(latest)) return latest as RoomView;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Zeitüberschreitung');
  };
  await until(() => true);
  return { ws, send, until, errors, view: () => latest as RoomView };
}

describe('Admin-Anmeldung', () => {
  it('ohne oder mit falschem Token: 401', async () => {
    expect((await api('/api/admin/me', {}, null)).status).toBe(401);
    expect((await api('/api/admin/me', {}, 'dev:falsch')).status).toBe(401);
    const me = await api('/api/admin/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ name: 'dev', mode: 'dev' });
  });

  it('außerhalb von lokal ohne Cognito ist der Admin-Bereich gesperrt', async () => {
    await app.close();
    app = createApp({ env: readEnv({ PORT: '0', STAGE: 'dev' }), log: silentLogger });
    await new Promise<void>((r) => app.http.listen(0, r));
    base = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
    expect((await api('/api/admin/me', {}, 'dev:kuckuck')).status).toBe(401);
  });
});

describe('Presets', () => {
  it('speichern erzeugt Versionen; Liste zeigt die neueste', async () => {
    const save = (stationSeconds: number) =>
      api('/api/admin/presets', {
        method: 'POST',
        body: JSON.stringify({ name: 'Testabend Kurz', override: { timing: { stationSeconds } } }),
      });
    expect((await save(30)).status).toBe(201);
    const v2 = await body(save(40));
    expect(v2).toMatchObject({ presetId: 'testabend-kurz', version: 2, createdBy: 'dev' });
    const list = await body(api('/api/admin/presets'));
    expect(list).toHaveLength(1);
    expect(list[0].version).toBe(2);
    const versions = await body(api('/api/admin/presets/testabend-kurz'));
    expect(versions.map((p: { version: number }) => p.version)).toEqual([2, 1]);
    // öffentlich: nur Namen
    const pub = await body(api('/api/presets', {}, null));
    expect(pub[0]).not.toHaveProperty('override');
  });

  it('ungültige Werte werden abgelehnt', async () => {
    const res = await api('/api/admin/presets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Kaputt', override: { timing: { stationSeconds: 1 } } }),
    });
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/stationSeconds/);
  });

  it('IDs aus Namen', () => {
    expect(slugify('Testabend Süß & Schnell!')).toBe('testabend-suess-schnell');
    expect(slugify('!!!')).toBe('preset');
  });
});

describe('Räume', () => {
  it('Admin wendet ein Preset an; alle sehen Werte und Herkunft', async () => {
    await api('/api/admin/presets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Schnell', override: { timing: { stationSeconds: 25 } } }),
    });
    const host = await player('Anna');
    const code = host.view().code;
    const res = await api(`/api/admin/rooms/${code}/config`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'preset', presetId: 'schnell' }),
    });
    expect(res.status).toBe(200);
    const v = await host.until((r) => r.config.timing.stationSeconds === 25);
    expect(v.preset).toEqual({ presetId: 'schnell', name: 'Schnell', version: 1 });

    await api(`/api/admin/rooms/${code}/config`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'custom', override: { needs: { tempo: 2 } } }),
    });
    await host.until((r) => r.config.needs.tempo === 2 && r.config.timing.stationSeconds === 60);
    host.ws.close();
  });

  it('Host wählt ein Preset in der Lobby, andere dürfen nicht', async () => {
    await api('/api/admin/presets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Lang', override: { timing: { stationSeconds: 90 } } }),
    });
    const host = await player('Anna');
    const guest = await player('Ben', host.view().code);
    guest.send({ type: 'lobby.preset', presetId: 'lang' });
    await new Promise((r) => setTimeout(r, 100));
    expect(guest.errors.join()).toMatch(/Host/);
    host.send({ type: 'lobby.preset', presetId: 'lang' });
    const v = await guest.until((r) => r.preset?.name === 'Lang');
    expect(v.config.timing.stationSeconds).toBe(90);
    host.send({ type: 'lobby.preset', presetId: null });
    await guest.until((r) => r.preset === null && r.config.timing.stationSeconds === 60);
    host.ws.close();
    guest.ws.close();
  });

  it('Live-Debug: Handys senden Messwerte, sobald ein Admin zuschaut; Log ohne Geheimes', async () => {
    const host = await player('Anna');
    const code = host.view().code;
    const list = await body(api('/api/admin/rooms'));
    expect(list[0]).toMatchObject({ code, players: 1, phase: 'lobby' });

    await api(`/api/admin/rooms/${code}`);
    await host.until((r) => r.debugUntil !== null);
    host.send({
      type: 'device.levels',
      levels: {
        at: 1,
        micDb: -42,
        motion: 1.5,
        touches: 0,
        care: ['blow'],
        rough: false,
        visible: true,
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    const debug: RoomDebug = await body(api(`/api/admin/rooms/${code}`));
    expect(debug.players[0]?.levels?.micDb).toBe(-42);
    expect(debug.log.map((e) => e.type)).toContain('join');
    expect(JSON.stringify(debug.log)).not.toMatch(/cuckoo|Kuckuck/);
    host.ws.close();
  });

  it('unbekannter Raum: 404', async () => {
    expect((await api('/api/admin/rooms/ZZZZ')).status).toBe(404);
  });
});
