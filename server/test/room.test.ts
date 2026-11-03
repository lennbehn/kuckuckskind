import { beforeEach, describe, expect, it } from 'vitest';
import { positionAt } from '@kuckuckskind/shared';
import { Room, type RoomDeps } from '../src/rooms/room.ts';
import { RoomSnapshotSchema } from '../src/rooms/snapshot.ts';
import { FakeClock } from './fake-clock.ts';

let clock: FakeClock;
let changes: number;
let removed: { id: string; reason: string }[];
let deps: RoomDeps;

function newRoom() {
  return new Room('BCDF', clock.now(), deps);
}

function roomWith(n: number) {
  const room = newRoom();
  const ids = Array.from(
    { length: n },
    (_, i) => room.addPlayer(`Spieler ${i + 1}`, `hash${i}`).id,
  );
  return { room, ids, host: ids[0] as string };
}

beforeEach(() => {
  clock = new FakeClock();
  changes = 0;
  removed = [];
  deps = {
    now: clock.now,
    schedule: clock.schedule,
    onChange: () => changes++,
    onPlayerRemoved: (_r, p, reason) => removed.push({ id: p.id, reason }),
    availableModules: [],
  };
});

describe('Lobby', () => {
  it('erster Spieler wird Host, Sitzordnung = Beitrittsreihenfolge', () => {
    const { room, ids, host } = roomWith(3);
    expect(room.hostId).toBe(host);
    expect(room.seating).toEqual(ids);
    expect(changes).toBe(3);
  });

  it('lehnt doppelte Namen (ohne Groß/Klein) und volle Räume ab', () => {
    const room = newRoom();
    room.addPlayer('Anna', 'h1');
    expect(() => room.addPlayer('anna', 'h2')).toThrow(/schon dabei/);
    for (let i = 2; i <= 8; i++) room.addPlayer(`P${i}`, `h${i}`);
    expect(() => room.addPlayer('Neu', 'h9')).toThrow(/voll/);
  });

  it('nur der Host ordnet die Plätze, und zwar vollständig', () => {
    const { room, ids, host } = roomWith(3);
    const [a, b, c] = ids as [string, string, string];
    expect(() => room.setSeating(b, [c, b, a])).toThrow(/Host/);
    expect(() => room.setSeating(host, [c, b])).toThrow();
    expect(() => room.setSeating(host, [c, b, b])).toThrow();
    room.setSeating(host, [c, a, b]);
    expect(room.seating).toEqual([c, a, b]);
  });

  it('Host-Einstellungen werden geprüft und übernommen', () => {
    const { room, host } = roomWith(3);
    room.updateSettings(host, { stationSeconds: 30 });
    room.updateSettings(host, { activeKinds: ['blow'] });
    expect(room.config.timing.stationSeconds).toBe(30);
    expect(room.config.care.activeKinds).toEqual(['blow']);
    expect(() => room.updateSettings(host, { stationSeconds: 1 })).toThrow();
    expect(room.config.timing.stationSeconds).toBe(30);
    expect(() => room.updateSettings(host, { modules: { fox: true } })).toThrow(
      /gibt es noch nicht/,
    );
  });

  it('Host geht → nächster am Tisch wird Host', () => {
    const { room, ids, host } = roomWith(3);
    room.removePlayer(host, 'left');
    expect(room.hostId).toBe(ids[1]);
    expect(room.seating).toEqual(ids.slice(1));
  });

  it('Getrennte verlieren ihren Platz erst nach der Gnadenfrist', () => {
    const { room, ids } = roomWith(3);
    const b = ids[1] as string;
    room.setConnected(b, false);
    clock.advance(room.config.timing.reconnectGraceSeconds * 1000 - 1);
    expect(room.players.has(b)).toBe(true);
    room.setConnected(b, true);
    room.setConnected(b, false);
    clock.advance(room.config.timing.reconnectGraceSeconds * 1000);
    expect(room.players.has(b)).toBe(false);
    expect(removed).toEqual([{ id: b, reason: 'expired' }]);
  });

  it('Kick nur durch den Host und nicht sich selbst', () => {
    const { room, ids, host } = roomWith(3);
    expect(() => room.kick(ids[1] as string, ids[2] as string)).toThrow();
    expect(() => room.kick(host, host)).toThrow();
    room.kick(host, ids[2] as string);
    expect(removed).toEqual([{ id: ids[2], reason: 'kicked' }]);
  });
});

describe('Partie', () => {
  it('braucht genug Spieler', () => {
    const { room, host } = roomWith(2);
    expect(() => room.start(host)).toThrow(/Mindestens 3/);
  });

  it('läuft alle Runden durch und endet in der Heimkehr', () => {
    const { room, host } = roomWith(3);
    room.start(host);
    expect(room.phase).toBe('rounds');
    const tl = room.timeline!;
    expect(tl.rounds).toBe(3);
    expect(tl.t0).toBe(clock.now() + room.config.timing.nextLeadMs);
    expect(() => room.addPlayer('Spät', 'hx')).toThrow(/läuft schon/);

    clock.advance(tl.t0 - clock.now() + 2 * (tl.stationMs + tl.handoverMs) + 1);
    expect(room.phase).toBe('rounds');
    expect(positionAt(tl, clock.now())).toMatchObject({ stage: 'station', round: 2 });
    clock.advance(tl.stationMs);
    expect(room.phase).toBe('homecoming');
    expect(room.finishedAt).not.toBeNull();
  });

  it('Pause hält den Takt an, Fortsetzen mit Vorlauf', () => {
    const { room, host } = roomWith(3);
    room.start(host);
    clock.advance(10_000);
    room.control(host, 'pause');
    clock.advance(10 * 60_000);
    expect(room.phase).toBe('rounds');
    room.control(host, 'resume');
    const pos = positionAt(room.timeline!, clock.now() + room.config.timing.nextLeadMs);
    expect(pos.stage).toBe('station');
  });

  it('Überspringen beendet die Station nach dem Vorlauf', () => {
    const { room, host } = roomWith(3);
    room.start(host);
    clock.advance(5000);
    room.control(host, 'skip');
    clock.advance(room.config.timing.nextLeadMs);
    expect(positionAt(room.timeline!, clock.now())).toMatchObject({ stage: 'handover', round: 0 });
  });

  it('Abbruch führt zurück in die Lobby und stoppt den Takt', () => {
    const { room, host } = roomWith(3);
    room.start(host);
    room.control(host, 'abort');
    expect(room.phase).toBe('lobby');
    expect(room.timeline).toBeNull();
    expect(clock.pending).toBe(0);
  });

  it('wer während der Partie geht, behält seinen Platz', () => {
    const { room, ids, host } = roomWith(3);
    room.start(host);
    room.removePlayer(ids[1] as string, 'left');
    expect(room.seating).toEqual(ids);
    expect(room.players.get(ids[1] as string)?.connected).toBe(false);
  });

  it('nur der Host steuert', () => {
    const { room, ids, host } = roomWith(3);
    expect(() => room.start(ids[1] as string)).toThrow(/Host/);
    room.start(host);
    expect(() => room.control(ids[1] as string, 'pause')).toThrow(/Host/);
  });
});

describe('Snapshot', () => {
  it('überlebt Speichern und Wiederherstellen samt Takt', () => {
    const { room, host } = roomWith(4);
    room.updateSettings(host, { stationSeconds: 30 });
    room.start(host);
    clock.advance(20_000);
    const snap = RoomSnapshotSchema.parse(JSON.parse(JSON.stringify(room.snapshot())));
    expect(Object.keys(snap.players[0]!)).toEqual(
      expect.not.arrayContaining(['token', 'connected']),
    );
    room.dispose();

    const restored = Room.restore(snap, deps);
    expect(restored.phase).toBe('rounds');
    expect(restored.seating).toEqual(room.seating);
    expect(restored.config.timing.stationSeconds).toBe(30);
    expect([...restored.players.values()].every((p) => !p.connected)).toBe(true);
    clock.advance(10 * 60_000);
    expect(restored.phase).toBe('homecoming');
  });

  it('Raum, dessen Takt während des Ausfalls ablief, kommt in der Heimkehr an', () => {
    const { room, host } = roomWith(3);
    room.start(host);
    const snap = room.snapshot();
    room.dispose();
    clock.advance(60 * 60_000);
    expect(Room.restore(snap, deps).phase).toBe('homecoming');
  });
});
