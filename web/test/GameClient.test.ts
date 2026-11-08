import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@kuckuckskind/shared';
import { GameClient, type SocketLike } from '../src/net/GameClient.ts';
import { memoryTokenStorage } from '../src/net/session.ts';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

let sockets: FakeSocket[];
let client: GameClient;
const storage = memoryTokenStorage();
const last = () => sockets[sockets.length - 1] as FakeSocket;

const welcome = (resumed = false): ServerMessage => ({
  type: 'welcome',
  protocol: PROTOCOL_VERSION,
  sessionToken: 'token-'.padEnd(24, 'x'),
  resumed,
  serverTime: Date.now(),
});

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  storage.clear();
  client = new GameClient({
    url: 'ws://test/ws',
    storage,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });
  client.start();
});

afterEach(() => {
  client.stop();
  vi.useRealTimers();
});

describe('GameClient', () => {
  it('sagt hallo und merkt sich das Token', () => {
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', protocol: PROTOCOL_VERSION });
    last().receive(welcome());
    expect(client.getState().status).toBe('open');
    expect(storage.get()).toMatch(/^token-/);
  });

  it('schickt beim Wiederverbinden das gespeicherte Token', () => {
    last().open();
    last().receive(welcome());
    last().drop();
    expect(client.getState().status).toBe('offline');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent[0]).toMatchObject({ type: 'hello', sessionToken: storage.get() });
  });

  it('wartet beim Wiederverbinden zunehmend länger, höchstens 5 s', () => {
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const before = sockets.length;
      last().drop();
      let waited = 0;
      while (sockets.length === before) {
        vi.advanceTimersByTime(100);
        waited += 100;
      }
      delays.push(waited);
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });

  it('verbindet sich nicht neu, wenn ein anderer Tab übernommen hat', () => {
    last().open();
    last().receive(welcome());
    last().drop(CLOSE_CODES.replaced);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(client.getState().status).toBe('replaced');
    client.reconnectNow();
    expect(sockets).toHaveLength(2);
  });

  it('gleicht die Uhr in Serien ab und schätzt den Versatz', () => {
    vi.setSystemTime(10_000);
    last().open();
    last().receive(welcome());
    vi.advanceTimersByTime(5 * 150);
    const pings = last().sent.filter((m) => m.type === 'time.ping');
    expect(pings).toHaveLength(5);
    // Server liegt 2 s vor, Antwort kommt nach 40 ms.
    for (const p of pings) {
      if (p.type !== 'time.ping') continue;
      vi.setSystemTime(p.clientSentAt + 40);
      last().receive({
        type: 'time.pong',
        clientSentAt: p.clientSentAt,
        serverReceivedAt: p.clientSentAt + 2020,
        serverSentAt: p.clientSentAt + 2020,
      });
    }
    expect(client.getState().clock?.offset).toBe(2000);
    expect(client.serverNow() - Date.now()).toBe(2000);

    vi.advanceTimersByTime(10_000);
    expect(last().sent.filter((m) => m.type === 'time.ping').length).toBeGreaterThan(5);
  });

  it('meldet Aktionen ohne Verbindung als Fehler', () => {
    client.createRoom('Anna');
    expect(client.getState().lastError?.code).toBe('offline');
  });

  it('nicht fortgesetzte Sitzung vergisst den alten Raum', () => {
    last().open();
    last().receive(welcome());
    last().receive({ type: 'room.closed', reason: 'kicked' });
    expect(client.getState().closedReason).toBe('kicked');
    expect(client.getState().room).toBeNull();
  });
});
