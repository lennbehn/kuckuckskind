import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  parseServerMessage,
  type RoomView,
  type ServerMessage,
} from '@kuckuckskind/shared';
import { createApp, type App } from '../src/app.ts';
import { readEnv } from '../src/env.ts';
import { silentLogger } from '../src/log.ts';
import { MemoryRoomStore } from '../src/rooms/store.ts';

/** Test-Client: sammelt Nachrichten und wartet gezielt auf bestimmte. */
class TestClient {
  readonly inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];
  token = '';
  closeCode: number | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const parsed = parseServerMessage(data.toString());
      if (!parsed.ok) throw new Error(parsed.error);
      const msg = parsed.message;
      const i = this.waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(msg);
      else this.inbox.push(msg);
    });
    ws.on('close', (code) => (this.closeCode = code));
  }

  static async connect(port: number, sessionToken?: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const c = new TestClient(ws);
    c.send({ type: 'hello', protocol: PROTOCOL_VERSION, sessionToken });
    const welcome = await c.next('welcome');
    c.token = welcome.sessionToken;
    return c;
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }

  next<T extends ServerMessage['type']>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const match = (m: ServerMessage) =>
      m.type === type && pred(m as Extract<ServerMessage, { type: T }>);
    const i = this.inbox.findIndex(match);
    if (i >= 0)
      return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout beim Warten auf ${type}`)), 2000);
      this.waiters.push({
        pred: match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      });
    });
  }

  /** Nächster Raumzustand, der die Bedingung erfüllt. */
  async room(pred: (r: RoomView) => boolean = () => true): Promise<RoomView> {
    return (await this.next('room.state', (m) => pred(m.room))).room;
  }

  close() {
    this.ws.close();
  }
}

let app: App;
let port: number;
let store: MemoryRoomStore;

async function start() {
  app = createApp({ env: readEnv({ PORT: '0' }), log: silentLogger, store });
  await app.rooms.restore();
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  port = (app.http.address() as AddressInfo).port;
}

beforeEach(async () => {
  store = new MemoryRoomStore();
  await start();
});
afterEach(() => app.close());

async function roomOf3() {
  const anna = await TestClient.connect(port);
  anna.send({ type: 'room.create', name: 'Anna' });
  const { code } = await anna.room();
  const ben = await TestClient.connect(port);
  ben.send({ type: 'room.join', roomCode: code.toLowerCase(), name: 'Ben' });
  await ben.room();
  const cem = await TestClient.connect(port);
  cem.send({ type: 'room.join', roomCode: code, name: 'Cem' });
  const view = await cem.room();
  return { code, anna, ben, cem, view };
}

describe('Raum über WebSocket', () => {
  it('erstellen, beitreten, alle sehen alle', async () => {
    const { anna, view } = await roomOf3();
    expect(view.players.map((p) => p.name)).toEqual(['Anna', 'Ben', 'Cem']);
    const annaView = await anna.room((r) => r.players.length === 3);
    expect(annaView.hostId).toBe(annaView.you.playerId);
    expect(view.you.playerId).not.toBe(annaView.you.playerId);
  });

  it('unbekannter Raum und doppelter Name werden gemeldet', async () => {
    const { code } = await roomOf3();
    const x = await TestClient.connect(port);
    x.send({ type: 'room.join', roomCode: 'ZZZZ', name: 'X' });
    expect(await x.next('error')).toMatchObject({ code: 'room_not_found' });
    x.send({ type: 'room.join', roomCode: code, name: 'ben' });
    expect(await x.next('error')).toMatchObject({ code: 'name_taken' });
  });

  it('Host ordnet Plätze und startet; alle bekommen denselben Takt', async () => {
    const { anna, ben, cem, view } = await roomOf3();
    const [a, b, c] = view.players.map((p) => p.id);
    anna.send({ type: 'lobby.seating', order: [a, c, b] });
    const seated = await ben.room((r) => r.players[1]?.id === c);
    expect(seated.players.map((p) => p.name)).toEqual(['Anna', 'Cem', 'Ben']);

    ben.send({ type: 'game.start' });
    expect(await ben.next('error')).toMatchObject({ code: 'not_allowed' });

    anna.send({ type: 'game.start' });
    const [ra, rb, rc] = (await Promise.all(
      [anna, ben, cem].map((cl) => cl.room((r) => r.phase === 'rounds')),
    )) as [RoomView, RoomView, RoomView];
    expect(ra.timeline).toEqual(rb.timeline);
    expect(rb.timeline).toEqual(rc.timeline);
    expect(ra.timeline?.rounds).toBe(3);
  });

  it('Wiederverbinden mit Token führt zurück in denselben Raum', async () => {
    const { code, ben, anna } = await roomOf3();
    const token = ben.token;
    ben.close();
    await anna.room((r) => r.players.find((p) => p.name === 'Ben')?.connected === false);

    const again = await TestClient.connect(port, token);
    const view = await again.room();
    expect(view.code).toBe(code);
    expect(view.players.find((p) => p.id === view.you.playerId)?.name).toBe('Ben');
    await anna.room((r) => r.players.every((p) => p.connected));
  });

  it('zweite Verbindung mit gleichem Token löst die erste ab', async () => {
    const { ben } = await roomOf3();
    const second = await TestClient.connect(port, ben.token);
    await second.room();
    await new Promise((r) => setTimeout(r, 50));
    expect(ben.closeCode).toBe(CLOSE_CODES.replaced);
  });

  it('unbekanntes Token bekommt ein neues', async () => {
    const c = await TestClient.connect(port, 'x'.repeat(32));
    expect(c.token).not.toBe('x'.repeat(32));
  });

  it('Verlassen meldet room.closed; Rauswurf ebenso', async () => {
    const { anna, ben, cem, view } = await roomOf3();
    ben.send({ type: 'room.leave' });
    expect(await ben.next('room.closed')).toMatchObject({ reason: 'left' });
    anna.send({ type: 'lobby.kick', playerId: view.you.playerId });
    expect(await cem.next('room.closed')).toMatchObject({ reason: 'kicked' });
    const left = await anna.room((r) => r.players.length === 1);
    expect(left.players[0]?.name).toBe('Anna');
  });

  it('Räume überleben einen Server-Neustart', async () => {
    const { code, anna, ben } = await roomOf3();
    anna.send({ type: 'game.start' });
    await ben.room((r) => r.phase === 'rounds');
    const token = ben.token;
    await app.close();

    await start();
    const again = await TestClient.connect(port, token);
    const view = await again.room();
    expect(view.code).toBe(code);
    expect(view.phase).toBe('rounds');
  });

  it('bremst Nachrichtenfluten', async () => {
    const c = await TestClient.connect(port);
    for (let i = 0; i < 100; i++) c.send({ type: 'time.ping', clientSentAt: i });
    expect(await c.next('error')).toMatchObject({ code: 'rate_limited' });
  });
});
