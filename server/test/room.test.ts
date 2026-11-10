import { beforeEach, describe, expect, it } from 'vitest';
import {
  emptyStats,
  holderOf,
  positionAt,
  type ServerMessage,
  type StationStats,
} from '@kuckuckskind/shared';
import { Room, type RoomDeps } from '../src/rooms/room.ts';
import { RoomSnapshotSchema } from '../src/rooms/snapshot.ts';
import { FakeClock } from './fake-clock.ts';

let clock: FakeClock;
let changes: number;
let removed: { id: string; reason: string }[];
let notified: { playerId: string; message: ServerMessage }[];
let deps: RoomDeps;

function newRoom() {
  return new Room('BCDF', clock.now(), deps);
}

/** Start + alle Eier fertig → Runden laufen (Takt beginnt nach Schlüpfen und Einblendung). */
function hatchAllEggs(room: Room, host: string) {
  room.start(host);
  for (const id of room.seating) {
    for (const kind of room.config.care.activeKinds) room.recordHatch(id, kind, 'sensor');
  }
}

/** Start → alle Eier → Einblendung abwarten → Spick-Wahl beenden → Runden laufen. */
function startRounds(room: Room, host: string) {
  hatchAllEggs(room, host);
  clock.advance(room.hatch!.revealEndsAt - clock.now());
  room.control(host, 'peekNow');
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
  notified = [];
  deps = {
    now: clock.now,
    schedule: clock.schedule,
    onChange: () => changes++,
    onPlayerRemoved: (_r, p, reason) => removed.push({ id: p.id, reason }),
    availableModules: ['falcon', 'feathers', 'owl'],
    notify: (_r, playerId, message) => notified.push({ playerId, message }),
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
    startRounds(room, host);
    expect(room.phase).toBe('rounds');
    const tl = room.timeline!;
    expect(tl.rounds).toBe(3);
    expect(tl.t0).toBe(
      clock.now() + Math.max(room.config.hatching.settleMs, room.config.timing.nextLeadMs),
    );
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
    startRounds(room, host);
    clock.advance(10_000);
    clock.advance(room.timeline!.t0 - clock.now());
    room.control(host, 'pause');
    clock.advance(10 * 60_000);
    expect(room.phase).toBe('rounds');
    room.control(host, 'resume');
    const pos = positionAt(room.timeline!, clock.now() + room.config.timing.nextLeadMs);
    expect(pos.stage).toBe('station');
  });

  it('Überspringen beendet die Station nach dem Vorlauf', () => {
    const { room, host } = roomWith(3);
    startRounds(room, host);
    clock.advance(room.timeline!.t0 - clock.now() + 5000);
    room.control(host, 'skip');
    clock.advance(room.config.timing.nextLeadMs);
    expect(positionAt(room.timeline!, clock.now())).toMatchObject({ stage: 'handover', round: 0 });
  });

  it('Abbruch führt zurück in die Lobby und stoppt den Takt', () => {
    const { room, host } = roomWith(3);
    startRounds(room, host);
    room.control(host, 'abort');
    expect(room.phase).toBe('lobby');
    expect(room.timeline).toBeNull();
    expect(clock.pending).toBe(0);
  });

  it('wer während der Partie geht, behält seinen Platz', () => {
    const { room, ids, host } = roomWith(3);
    startRounds(room, host);
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
    startRounds(room, host);
    clock.advance(room.timeline!.t0 - clock.now() + 20_000);
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
    startRounds(room, host);
    const snap = room.snapshot();
    room.dispose();
    clock.advance(60 * 60_000);
    expect(Room.restore(snap, deps).phase).toBe('homecoming');
  });
});

describe('Ausbrüten', () => {
  it('Start führt ins Ausbrüten; Schlüpfen erst, wenn alle alle Pflegearten geschafft haben', () => {
    const { room, ids, host } = roomWith(3);
    room.start(host);
    expect(room.phase).toBe('hatching');
    const kinds = room.config.care.activeKinds;
    for (const id of ids.slice(0, 2)) for (const k of kinds) room.recordHatch(id, k, 'sensor');
    const last = ids[2] as string;
    for (const k of kinds.slice(0, -1)) room.recordHatch(last, k, 'fallback');
    expect(room.phase).toBe('hatching');
    expect(room.viewFor(host).players[2]?.hatched).toEqual(kinds.slice(0, -1));
    room.recordHatch(last, kinds[kinds.length - 1]!, 'sensor');
    expect(room.phase).toBe('peekChoice');
    expect(room.hatch!.at).toBe(clock.now() + room.config.timing.nextLeadMs);
  });

  it('lehnt inaktive Pflegearten und falsche Phase ab', () => {
    const { room, host } = roomWith(3);
    expect(() => room.recordHatch(host, 'blow', 'sensor')).toThrow();
    room.start(host);
    expect(() => room.recordHatch(host, 'feed', 'sensor')).toThrow(/nicht aktiv/);
  });

  it('Host kann alle sofort schlüpfen lassen', () => {
    const { room, ids, host } = roomWith(3);
    room.start(host);
    expect(() => room.control(ids[1] as string, 'hatchNow')).toThrow(/Host/);
    room.control(host, 'hatchNow');
    expect(room.phase).toBe('peekChoice');
  });

  it('verteilt genau einen Kuckuck', () => {
    const { room, host } = roomWith(5);
    startRounds(room, host);
    const roles = room.seating.map((id) => room.roleOf(id));
    expect(roles.filter((r) => r === 'cuckoo')).toHaveLength(1);
    expect(roles.filter((r) => r === 'foster')).toHaveLength(4);
  });

  it('jeder sieht nur die eigene Rolle – und nur während der Einblendung', () => {
    const { room, ids, host } = roomWith(4);
    hatchAllEggs(room, host);
    for (const id of ids) {
      const view = room.viewFor(id);
      expect(view.you.role).toBe(room.roleOf(id));
      const json = JSON.stringify(view);
      expect(json.match(/"(cuckoo|foster)"/g)).toHaveLength(1);
    }
    const before = changes;
    clock.advance(room.hatch!.revealEndsAt - clock.now());
    expect(changes).toBeGreaterThan(before);
    for (const id of ids) expect(JSON.stringify(room.viewFor(id))).not.toMatch(/"(cuckoo|foster)"/);
  });

  it('Abbruch setzt Ausbrüten und Rollen zurück', () => {
    const { room, host } = roomWith(3);
    startRounds(room, host);
    room.control(host, 'abort');
    expect(room.roles).toBeNull();
    expect(room.hatch).toBeNull();
    expect(room.viewFor(host).players.every((p) => p.hatched.length === 0)).toBe(true);
  });

  it('Rollen und Fortschritt überleben einen Neustart', () => {
    const { room, ids, host } = roomWith(3);
    room.start(host);
    room.recordHatch(ids[0] as string, 'blow', 'fallback');
    room.setCalibration(ids[0] as string, {
      platform: 'ios',
      standalone: false,
      wakeLock: true,
      mic: { status: 'denied' },
      motion: { status: 'ok', scale: 1.2 },
      cover: { minTouchPoints: 4, maxTouches: 5, method: 'touches' },
    });
    const restored = Room.restore(RoomSnapshotSchema.parse(room.snapshot()), deps);
    expect(restored.hatched.get(ids[0] as string)?.get('blow')).toBe('fallback');
    expect(restored.calibrations.get(ids[0] as string)?.mic.status).toBe('denied');
    restored.control(host, 'hatchNow');
    const snap = RoomSnapshotSchema.parse(restored.snapshot());
    expect(Room.restore(snap, deps).roles).toEqual(restored.roles);
  });
});

// ---------------------------------------------------------------------------
// M4: Spick-Wahl, Stationen, Heimkehr, Abstimmung, Enthüllung
// ---------------------------------------------------------------------------

const stats = (round: number, patch: Partial<StationStats> = {}): StationStats => ({
  ...emptyStats(round, 1),
  durationMs: 60_000,
  samples: [{ t: 0, w: 1, n: [0.1, 0.1, 0.1], c: [] }],
  ...patch,
});

/** Partie bis zur Heimkehr; jedes Handy meldet seine Stationen. */
function playToHomecoming(
  room: Room,
  host: string,
  perStation?: (owner: string, round: number) => Partial<StationStats>,
) {
  startRounds(room, host);
  const tl = room.timeline!;
  for (let r = 0; r < tl.rounds; r++) {
    for (const owner of room.seating) room.recordStation(owner, stats(r, perStation?.(owner, r)));
  }
  clock.advance(tl.t0 - clock.now() + tl.rounds * (tl.stationMs + tl.handoverMs));
  expect(room.phase).toBe('homecoming');
}

describe('Spick-Wahl', () => {
  it('jeder wählt geheim; wenn alle gewählt haben, beginnen die Runden', () => {
    const { room, ids, host } = roomWith(3);
    hatchAllEggs(room, host);
    expect(() => room.choosePeek(ids[0]!, ids[1]!)).toThrow(/Noch nicht/);
    clock.advance(room.hatch!.revealEndsAt - clock.now());

    room.choosePeek(ids[0]!, ids[1]!);
    expect(() => room.choosePeek(ids[1]!, ids[1]!)).toThrow(/nicht wählen/);
    const other = room.viewFor(ids[1]!);
    expect(other.peek?.chosenCount).toBe(1);
    expect(other.you.peekChoice).toBeNull();
    expect(JSON.stringify(other)).not.toContain(`"peekChoice":"${ids[1]}"`);
    expect(room.viewFor(ids[0]!).you.peekChoice).toBe(ids[1]);

    room.choosePeek(ids[1]!, ids[2]!);
    room.choosePeek(ids[2]!, ids[0]!);
    expect(room.phase).toBe('rounds');
  });

  it('nach Ablauf der Frist wird für die Übrigen zufällig gewählt', () => {
    const { room, host } = roomWith(4);
    hatchAllEggs(room, host);
    clock.advance(room.match!.peekDeadline - clock.now());
    expect(room.phase).toBe('rounds');
    for (const id of room.seating)
      expect(room.peekOptionsFor(id)).toContain(room.match!.peekChoices[id]);
  });

  it('ohne Spick-Station geht es nach der Einblendung direkt los', () => {
    const { room, host } = roomWith(3);
    room.applyPreset({ peek: { enabled: false } });
    hatchAllEggs(room, host);
    clock.advance(room.hatch!.revealEndsAt - clock.now());
    expect(room.phase).toBe('rounds');
    expect(room.viewFor(host).you.peekOptions).toBeUndefined();
  });
});

describe('Stationen und Heimkehr', () => {
  it('Aufzeichnung bleibt nur für die Spick-Station', () => {
    const { room, ids, host } = roomWith(3);
    hatchAllEggs(room, host);
    clock.advance(room.hatch!.revealEndsAt - clock.now());
    const [a, b, c] = ids as [string, string, string];
    room.choosePeek(a, c);
    room.choosePeek(b, c);
    room.choosePeek(c, a);
    const peekR = [0, 1, 2].find((r) => holderOf(a, r, room.seating) === c)!;
    for (let r = 0; r < 3; r++) room.recordStation(a, stats(r));
    const st = room.match!.stations[a]!;
    expect(st[String(peekR)]!.samples).toHaveLength(1);
    for (const r of [0, 1, 2].filter((x) => x !== peekR))
      expect(st[String(r)]!.samples).toHaveLength(0);
    expect(room.viewFor(a).you.chick?.reportedRounds).toEqual([0, 1, 2]);
  });

  it('jedes Handy bekommt Charakter und Seed nur des eigenen Kükens', () => {
    const { room, ids, host } = roomWith(3);
    hatchAllEggs(room, host);
    const v = room.viewFor(ids[1]!);
    expect(v.you.chick?.character).toEqual(room.match!.characters[ids[1]!]);
    expect(JSON.stringify(v)).not.toContain('chickSeeds');
  });

  it('Heimkehr: öffentlicher Küken-Zustand, eigene Hinweise und Spick-Aufzeichnung', () => {
    const { room, ids, host } = roomWith(3);
    playToHomecoming(room, host, (owner, r) =>
      r === 1 ? { roughMs: 5000, loss: 0.2, wellbeingEnd: 0.8 } : {},
    );
    const v = room.viewFor(ids[0]!);
    expect(Object.keys(v.chicks!)).toEqual(room.seating);
    expect(v.you.story?.hints.length).toBeGreaterThan(0);
    expect(v.you.story?.hints.join(' ')).toMatch(/geschüttelt|herumgeschaukelt/);
    expect(v.you.story?.peek?.targetId).toBe(room.match!.peekChoices[ids[0]!]);
    expect(v.you.story?.peek?.stats.samples.length).toBe(1);
  });
});

describe('Abstimmung und Enthüllung', () => {
  function toVoting(n = 4) {
    const r = roomWith(n);
    playToHomecoming(r.room, r.host);
    r.room.control(r.host, 'startVoting');
    expect(r.room.phase).toBe('voting');
    const cuckoo = r.ids.find((id) => r.room.roleOf(id) === 'cuckoo')!;
    const fosters = r.ids.filter((id) => id !== cuckoo);
    return { ...r, cuckoo, fosters };
  }

  it('nur Stimmenzahlen sind sichtbar, die eigene Stimme nur für einen selbst', () => {
    const { room, cuckoo, fosters } = toVoting();
    room.castVote(fosters[0]!, cuckoo);
    room.castVote(fosters[1]!, cuckoo);
    const v = room.viewFor(fosters[2]!);
    expect(v.voting?.counts[cuckoo]).toBe(2);
    expect(v.voting?.votedCount).toBe(2);
    expect(v.you.vote).toBeNull();
    expect(room.viewFor(fosters[0]!).you.vote).toBe(cuckoo);
    expect(() => room.castVote(cuckoo, cuckoo)).toThrow(/selbst/);
    // Stimme ändern und zurückziehen
    room.castVote(fosters[1]!, fosters[0]!);
    room.castVote(fosters[1]!, null);
    expect(room.viewFor(cuckoo).voting?.counts[cuckoo]).toBe(1);
    // Keine Rollen während der Abstimmung
    expect(JSON.stringify(v)).not.toMatch(/"(cuckoo|foster)"/);
  });

  it('Kuckuck enttarnt, alle überleben → Pflegeeltern gewinnen; Enthüllung gleichzeitig', () => {
    const { room, host, cuckoo, fosters } = toVoting();
    for (const f of fosters) room.castVote(f, cuckoo);
    room.control(host, 'closeVoting');
    expect(room.phase).toBe('reveal');
    const v = room.viewFor(fosters[0]!);
    expect(v.reveal).toMatchObject({ accusedId: cuckoo, accusedRole: 'cuckoo' });
    expect(v.reveal!.at).toBe(clock.now() + room.config.timing.nextLeadMs);
    expect(v.result?.winner).toBe('fosters');
    expect(v.result?.roles[cuckoo]).toBe('cuckoo');
  });

  it('Gleichstand → Stichwahl; erneuter Gleichstand → niemand beschuldigt → Kuckuck gewinnt', () => {
    const { room, host, cuckoo, fosters } = toVoting(4);
    const [f1, f2, f3] = fosters as [string, string, string];
    room.castVote(f1, f2);
    room.castVote(f2, f1);
    room.control(host, 'closeVoting');
    expect(room.phase).toBe('voting');
    expect(room.viewFor(f3).voting).toMatchObject({
      runoff: 1,
      candidates: [f1, f2].sort((a, b) => room.seating.indexOf(a) - room.seating.indexOf(b)),
    });
    expect(() => room.castVote(f3, cuckoo)).toThrow(/Nicht wählbar/);
    room.castVote(f3, f1);
    room.castVote(cuckoo, f2);
    room.control(host, 'closeVoting');
    expect(room.viewFor(f3).reveal).toMatchObject({ accusedId: null, reason: 'tie' });
    expect(room.viewFor(f3).result?.winner).toBe('cuckoo');
  });

  it('ohne Kuckuck keine Abstimmung', () => {
    const { room, host } = roomWith(3);
    room.applyPreset({ room: { cuckooCount: 0 } });
    playToHomecoming(room, host);
    room.control(host, 'startVoting');
    expect(room.phase).toBe('reveal');
    expect(room.viewFor(host).reveal?.reason).toBe('no_cuckoo');
    expect(room.viewFor(host).result?.winner).toBe('fosters');
  });

  it('gestorbenes Küken zählt in der Wertung', () => {
    const r = roomWith(3);
    playToHomecoming(r.room, r.host, (owner, round) =>
      owner === r.ids[0] && round === 2 ? { died: true, wellbeingEnd: 0 } : {},
    );
    expect(r.room.viewFor(r.host).chicks![r.ids[0]!]).toEqual({ wellbeing: 0, alive: false });
  });

  it('Zwischenstand überlebt einen Neustart samt Stimmen', () => {
    const { room, cuckoo, fosters } = toVoting();
    room.castVote(fosters[0]!, cuckoo);
    const restored = Room.restore(
      RoomSnapshotSchema.parse(JSON.parse(JSON.stringify(room.snapshot()))),
      deps,
    );
    expect(restored.phase).toBe('voting');
    expect(restored.viewFor(fosters[0]!).you.vote).toBe(cuckoo);
  });
});

// ---------------------------------------------------------------------------
// Hinweis-Module: Eule, Falkenblick, Kuckucksfedern
// ---------------------------------------------------------------------------

describe('Eule', () => {
  function toPeek(n = 4) {
    const r = roomWith(n);
    r.room.updateSettings(r.host, { modules: { owl: true } });
    hatchAllEggs(r.room, r.host);
    clock.advance(r.room.hatch!.revealEndsAt - clock.now());
    const owl = r.room.match!.owlId!;
    return { ...r, owl };
  }

  it('gibt es ab 4 Spielern; nur die Eule sieht ihre Auswahl', () => {
    const { room, ids, owl } = toPeek();
    expect(owl).toBeTruthy();
    expect(room.roleOf(owl)).toBe('foster');
    expect(room.viewFor(owl).you.owl?.options).toHaveLength(3);
    for (const id of ids.filter((x) => x !== owl)) expect(room.viewFor(id).you.owl).toBeUndefined();

    const small = roomWith(3);
    small.room.updateSettings(small.host, { modules: { owl: true } });
    hatchAllEggs(small.room, small.host);
    expect(small.room.match!.owlId).toBeNull();

    // Ohne Häkchen in der Lobby keine Eule.
    const off = roomWith(5);
    hatchAllEggs(off.room, off.host);
    expect(off.room.match!.owlId).toBeNull();
  });

  it('Runden beginnen erst, wenn auch die Eule gewählt hat', () => {
    const { room, ids, owl } = toPeek();
    for (const id of ids) room.choosePeek(id, room.peekOptionsFor(id)[0]!);
    expect(room.phase).toBe('peekChoice');
    expect(() =>
      room.chooseOwl(
        ids.find((x) => x !== owl)!,
        owl,
      ),
    ).toThrow(/Nur die Eule/);
    expect(() => room.chooseOwl(owl, owl)).toThrow();
    room.chooseOwl(
      owl,
      ids.find((x) => x !== owl)!,
    );
    expect(room.phase).toBe('rounds');
  });

  it('Urteil erst ab der Heimkehr – ehrlich nach Schaden, nie die Rolle', () => {
    const { room, host, ids, owl } = toPeek();
    const target = ids.find((x) => x !== owl)!;
    room.chooseOwl(owl, target);
    clock.advance(room.match!.peekDeadline - clock.now());
    const tl = room.timeline!;
    // Der beobachtete Mitspieler richtet an jedem fremden Küken großen Schaden an.
    for (let r = 0; r < tl.rounds; r++) {
      for (const o of room.seating) {
        const loss = holderOf(o, r, room.seating) === target ? 0.3 : 0.02;
        room.recordStation(o, stats(r, { loss }));
      }
    }
    expect(room.viewFor(owl).you.owl).toBeUndefined(); // während der Runden nicht
    clock.advance(tl.t0 - clock.now() + tl.rounds * (tl.stationMs + tl.handoverMs));
    const v = room.viewFor(owl);
    expect(v.you.owl?.verdict).toEqual({ targetId: target, level: 'high' });
    expect(JSON.stringify(v.you.owl)).not.toMatch(/cuckoo|foster/);
    expect(host).toBeTruthy();
  });
});

describe('Falkenblick', () => {
  const good = { reliefMs: { blow: 8000 }, loss: 0.01 };

  function inRounds(n = 4) {
    const r = roomWith(n);
    startRounds(r.room, r.host);
    clock.advance(r.room.timeline!.t0 - clock.now() + 1000); // Runde 0 läuft
    return r;
  }

  it('wer eine fremde Station sehr gut pflegt, verdient einen Blick (höchstens wie eingestellt)', () => {
    const { room } = inRounds();
    const owner = room.seating[0]!;
    const holder1 = holderOf(owner, 1, room.seating);
    room.recordStation(owner, stats(0, good)); // eigenes Küken: kein Blick
    expect(room.match!.glances[owner]).toBeUndefined();
    room.recordStation(owner, stats(1, good));
    expect(room.match!.glances[holder1]).toBe(1);
    room.recordStation(room.seating[3]!, stats(2, good));
    expect(Math.max(...Object.values(room.match!.glances))).toBeLessThanOrEqual(1);
    room.recordStation(room.seating[1]!, stats(1, { loss: 0.2 }));
    expect(room.match!.glances[holderOf(room.seating[1]!, 1, room.seating)] ?? 0).toBe(0);
  });

  it('Blick zeigt dem Handy des Halters, was das Küken beim Ziel braucht – live, dann vorbei', () => {
    const { room } = inRounds();
    const [a, b, c] = room.seating as [string, string, string];
    // In Runde 0 hält jeder sein eigenes Handy. a hat einen Blick und schaut zu b.
    room.match!.glances[a] = 1;
    expect(room.viewFor(a).you.holderGlances).toBe(1);
    room.reportChick(b, {
      at: clock.now(),
      round: 0,
      needs: { heat: 0.8, restless: 0.1, tired: 0.5, hunger: 0, bored: 0 },
      urgentMs: { heat: 0, restless: 0, tired: 0, hunger: 0, bored: 0 },
      wellbeing: 1,
      alive: true,
      stationLoss: 0,
    });
    room.useGlance(a, b);
    const first = notified.at(-1)!;
    expect(first.playerId).toBe(a);
    expect(first.message).toMatchObject({
      type: 'glance.result',
      targetId: b,
      chickOwnerId: b,
      needs: ['heat', 'tired'],
    });
    expect(room.viewFor(a).you.holderGlances).toBe(0);
    expect(() => room.useGlance(a, c)).toThrow(/Kein Falkenblick/);
    const count = notified.length;
    clock.advance(3000);
    expect(notified.length).toBeGreaterThan(count); // laufende Aktualisierung
    clock.advance(60_000);
    const after = notified.length;
    clock.advance(5000);
    expect(notified.length).toBe(after); // Blick ist vorbei
  });

  it('nicht auf sich selbst und nicht außerhalb einer Station', () => {
    const { room } = inRounds();
    const a = room.seating[0]!;
    room.match!.glances[a] = 1;
    expect(() => room.useGlance(a, a)).toThrow();
    const tl = room.timeline!;
    clock.advance(tl.t0 + tl.stationMs + 100 - clock.now()); // Weitergabe
    expect(() => room.useGlance(a, room.seating[1]!)).toThrow(/Station/);
  });
});

describe('Kuckucksfedern', () => {
  it('fallen nach starker Sabotage des Kuckucks; bei fosterChance 0 nie bei Pflegeeltern', () => {
    const { room, host } = roomWith(4);
    room.applyPreset({
      modules: { feathers: { enabled: true, cuckooChance: 1, fosterChance: 0 } },
    });
    startRounds(room, host);
    const seating = room.seating;
    const cuckoo = seating.find((id) => room.roleOf(id) === 'cuckoo')!;
    for (let r = 1; r < 4; r++)
      for (const o of seating) room.recordStation(o, stats(r, { loss: 0.2 }));
    const feathers = room.match!.feathers;
    for (const [owner, rounds] of Object.entries(feathers)) {
      for (const r of rounds) expect(holderOf(owner, r, seating)).toBe(cuckoo);
    }
    expect(Object.values(feathers).flat().length).toBe(3); // drei fremde Stationen des Kuckucks
    const owner = Object.keys(feathers)[0]!;
    expect(room.viewFor(owner).you.feathers).toEqual(feathers[owner]);
  });

  it('überleben einen Neustart mit Eule und Blicken', () => {
    const { room, host } = roomWith(4);
    startRounds(room, host);
    room.match!.glances[room.seating[0]!] = 1;
    room.match!.feathers[room.seating[1]!] = [2];
    const restored = Room.restore(
      RoomSnapshotSchema.parse(JSON.parse(JSON.stringify(room.snapshot()))),
      deps,
    );
    expect(restored.match!.glances).toEqual(room.match!.glances);
    expect(restored.match!.feathers).toEqual(room.match!.feathers);
    expect(restored.match!.owlId).toBe(room.match!.owlId);
  });
});
