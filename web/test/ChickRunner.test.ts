import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTimeline,
  pauseTimeline,
  resolveConfig,
  resumeTimeline,
  skipStage,
  type ChickReport,
  type StationStats,
  type Timeline,
} from '@kuckuckskind/shared';
import { ChickRunner, thin, type RunnerStorage } from '../src/game/ChickRunner.ts';

const config = resolveConfig({ timing: { stationSeconds: 20, handoverSeconds: 5 } });
const character = { likes: [], dislikes: [] };

let saved: Map<string, unknown>;
let reports: ChickReport[];
let stations: StationStats[];
let storage: RunnerStorage;

const tl0 = () =>
  createTimeline({ startsAt: 10_000, stationMs: 20_000, handoverMs: 5_000, rounds: 3 });

function runner(tl: Timeline = tl0()) {
  return new ChickRunner(
    'k',
    config,
    character,
    1,
    tl,
    storage,
    {
      report: (r) => reports.push(r),
      station: (s) => stations.push(s),
    },
    null,
  );
}

/** Server- und Wanduhr laufen gemeinsam in 100-ms-Schritten. */
function run(r: ChickRunner, from: number, to: number, offset = 0) {
  for (let t = from; t <= to; t += 100) r.advance(t, t + offset);
}

beforeEach(() => {
  saved = new Map();
  reports = [];
  stations = [];
  storage = { load: (k) => saved.get(k) ?? null, save: (k, v) => saved.set(k, structuredClone(v)) };
});

describe('ChickRunner', () => {
  it('simuliert nur während Stationen und meldet jede Station einmal', () => {
    const r = runner();
    run(r, 0, 10_000 + 3 * 25_000);
    expect(stations.map((s) => s.round)).toEqual([0, 1, 2]);
    for (const s of stations) expect(s.durationMs).toBeCloseTo(20_000, -2);
    expect(stations[0]!.samples.length).toBeGreaterThan(15);
    expect(reports.length).toBeGreaterThan(10);
  });

  it('Pflege wirkt auf das Küken', () => {
    const a = runner();
    a.setInput({ active: ['blow', 'rock', 'cover'], rough: false });
    run(a, 0, 30_000);
    const careful = a.getView().state;
    saved.clear();
    const b = runner();
    run(b, 0, 30_000);
    expect(careful.needs.heat).toBeLessThan(b.getView().state.needs.heat);
  });

  it('Pause: keine Zeit vergeht für das Küken', () => {
    const r = runner();
    run(r, 0, 15_000);
    const before = r.getView().state.needs.heat;
    const paused = pauseTimeline(tl0(), 15_000);
    r.setTimeline(paused);
    run(r, 15_000, 60_000);
    expect(r.getView().state.needs.heat).toBeCloseTo(before, 5);
    r.setTimeline(resumeTimeline(paused, 60_000));
    run(r, 60_000, 62_000);
    expect(r.getView().state.needs.heat).toBeGreaterThan(before);
    expect(stations).toHaveLength(0);
  });

  it('Überspringen: übersprungene Zeit wird nicht simuliert', () => {
    const r = runner();
    run(r, 0, 12_000);
    const heat = r.getView().state.needs.heat;
    r.setTimeline(skipStage(tl0(), 12_000, 1500));
    run(r, 12_100, 13_500);
    expect(stations).toHaveLength(1);
    // nur ~1,5 s Wachstum, nicht 18 s
    expect(r.getView().state.needs.heat - heat).toBeLessThan(config.needs.heat.growthPerSecond * 3);
  });

  it('eingefrorener Tab: verpasste Zeit wird ohne Pflege nachgeholt', () => {
    const r = runner();
    r.setInput({ active: ['blow'], rough: false });
    r.advance(10_000, 10_000);
    r.advance(25_000, 25_000); // 15 s am Stück
    const s = r.getView().state;
    expect(s.needs.restless).toBeGreaterThan(0.2);
    // Zwei Sprünge: je nur die letzte Sekunde mit Pusten, der Rest ohne Pflege.
    r.advance(30_100, 30_100);
    expect(stations[0]!.reliefMs.blow ?? 0).toBeLessThanOrEqual(2000);
    expect(stations[0]!.durationMs).toBeCloseTo(20_000, -2);
  });

  it('Neuladen: Zustand kommt aus dem Speicher', () => {
    const a = runner();
    run(a, 0, 14_000);
    const st = a.getView().state;
    const b = runner();
    b.advance(14_000, 14_000);
    expect(b.getView().state.needs.heat).toBeCloseTo(st.needs.heat, 2);
  });

  it('sendet unbestätigte Stationen erneut', () => {
    const r = runner();
    run(r, 0, 10_000 + 25_000 * 2);
    expect(stations).toHaveLength(2);
    r.resendMissing([0]);
    expect(stations.map((s) => s.round)).toEqual([0, 1, 1]);
  });

  it('dünnt Aufzeichnungen gleichmäßig aus', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const t = thin(xs, 10);
    expect(t).toHaveLength(10);
    expect(t[0]).toBe(0);
    expect(t[9]).toBe(999);
    expect(thin([1, 2], 10)).toEqual([1, 2]);
  });
});
