import {
  NO_CARE,
  createRng,
  emptyStats,
  initialChick,
  positionAt,
  roundStartsAt,
  sample,
  startStation,
  stepChick,
  type CareInput,
  type Character,
  type ChickReport,
  type ChickState,
  type GameConfig,
  type StationStats,
  type Timeline,
} from '@kuckuckskind/shared';

const STEP_MS = 100;
/** Höchstens so viele Aufzeichnungspunkte je Station (Nachrichtengröße). */
const MAX_SAMPLES = 300;
/** Nachgeholte Zeit (eingefrorener Tab) zählt als „niemand hat gepflegt“. */
const LIVE_WINDOW_MS = 1000;

export interface RunnerStorage {
  load(key: string): unknown;
  save(key: string, value: unknown): void;
}

export interface RunnerSink {
  report(report: ChickReport): void;
  station(stats: StationStats): void;
}

interface Persisted {
  state: ChickState;
  /** Simulierte Stationszeit je Runde (ms). */
  simulated: Record<number, number>;
  open: StationStats | null;
  finished: StationStats[];
  lastWall: number | null;
}

export interface RunnerView {
  state: ChickState;
  round: number | null;
  /** Gerade Schaden (für das Gesicht). */
  hurting: boolean;
  input: CareInput;
}

/**
 * Simuliert das Küken auf dem Handy seines Eigentümers – egal, wer es gerade hält.
 *
 * Statt Uhrzeit zu simulieren, verfolgt der Runner je Runde die *gespielte Stationszeit*
 * (aus dem Takt). So bleibt eine Pause eine Pause, und ein Sprung durch „Überspringen“
 * wird nicht nachträglich simuliert. Ist dagegen echte Zeit vergangen (Tab eingefroren,
 * Bildschirm gesperrt), wird sie nachgeholt – ohne Pflege, denn es hat ja niemand gepflegt.
 */
export class ChickRunner {
  private p: Persisted;
  private timeline: Timeline;
  private input: CareInput = NO_CARE;
  private lastReportAt = 0;
  private hurtingUntil = 0;
  private readonly listeners = new Set<() => void>();
  private view: RunnerView;

  constructor(
    private readonly key: string,
    private readonly config: GameConfig,
    private readonly character: Character,
    seed: number,
    timeline: Timeline,
    private readonly storage: RunnerStorage,
    private readonly sink: RunnerSink,
    resumeFrom: ChickReport | null,
  ) {
    this.timeline = timeline;
    const saved = storage.load(key) as Persisted | null;
    this.p = saved ?? {
      state: resumeFrom
        ? {
            needs: resumeFrom.needs as ChickState['needs'],
            urgentMs: resumeFrom.urgentMs as ChickState['urgentMs'],
            wellbeing: resumeFrom.wellbeing,
            alive: resumeFrom.alive,
            stationLoss: resumeFrom.stationLoss,
          }
        : initialChick(config, createRng(seed)),
      simulated: {},
      open: null,
      finished: [],
      lastWall: null,
    };
    this.view = { state: this.p.state, round: null, hurting: false, input: NO_CARE };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getView = () => this.view;

  setTimeline(tl: Timeline) {
    this.timeline = tl;
  }

  /** Was der Halter gerade tut (von Sensoren oder Ersatz-Tasten). */
  setInput(input: CareInput) {
    this.input = input;
  }

  /** Bis zur Server-Zeit `now` rechnen; `wall` = lokale Uhr (für echte vergangene Zeit). */
  advance(now: number, wall: number) {
    const tl = this.timeline;
    const realDt = this.p.lastWall === null ? STEP_MS : Math.max(0, wall - this.p.lastWall);
    this.p.lastWall = wall;
    let budget = realDt;
    const lossBefore = this.p.state.wellbeing;

    const pos = positionAt(tl, now);
    const lastRound =
      pos.stage === 'before' ? -1 : pos.stage === 'done' ? tl.rounds - 1 : pos.round;

    for (let r = 0; r <= lastRound; r++) {
      const target = this.stationElapsed(r, now);
      const done = this.p.simulated[r] ?? 0;
      if (target <= done) continue;
      const run = Math.min(target - done, budget);
      budget -= run;
      this.simulate(r, run);
      // Rest (übersprungene Zeit) gilt als gespielt, wird aber nicht simuliert.
      this.p.simulated[r] = target;
    }
    // Abgeschlossene Stationen melden.
    if (this.p.open && this.stationOver(this.p.open.round, now)) this.finish();

    if (now - this.lastReportAt >= this.config.timing.stateReportIntervalMs) {
      this.lastReportAt = now;
      this.sink.report(this.report(now, pos.stage === 'station' ? pos.round : null));
      this.storage.save(this.key, this.p);
    }
    if (this.p.state.wellbeing < lossBefore - 1e-9) this.hurtingUntil = wall + 600;
    this.view = {
      state: this.p.state,
      round: pos.stage === 'station' && !pos.paused ? pos.round : null,
      hurting: wall < this.hurtingUntil,
      input: this.input,
    };
    for (const fn of this.listeners) fn();
  }

  /** Gespielte Stationszeit der Runde r bis `now` (Pause eingefroren). */
  private stationElapsed(r: number, now: number) {
    const tl = this.timeline;
    const t = tl.pausedAt !== null ? Math.min(now, tl.pausedAt) : now;
    return Math.max(0, Math.min(tl.stationMs, t - roundStartsAt(tl, r)));
  }

  private stationOver(r: number, now: number) {
    return this.stationElapsed(r, now) >= this.timeline.stationMs;
  }

  private simulate(round: number, ms: number) {
    if (ms <= 0) return;
    if (!this.p.open || this.p.open.round !== round) {
      if (this.p.open) this.finish();
      this.p.state = startStation(this.p.state);
      this.p.open = emptyStats(round, this.p.state.wellbeing);
    }
    const stats = this.p.open;
    const env = { config: this.config, character: this.character };
    const every = this.config.peek.sampleIntervalMs;
    let left = ms;
    while (left > 0) {
      const dt = Math.min(STEP_MS, left);
      // Nur die jüngste Zeit mit der aktuellen Pflege; Nachgeholtes ohne Pflege.
      const input = left <= LIVE_WINDOW_MS ? this.input : NO_CARE;
      const before = stats.durationMs;
      this.p.state = stepChick(this.p.state, input, dt, env, stats);
      if (!this.p.state.alive) stats.durationMs = before + dt;
      if (Math.floor(stats.durationMs / every) > Math.floor(before / every) || before === 0) {
        stats.samples.push(sample(this.p.state, input, stats.durationMs, this.config));
      }
      left -= dt;
    }
  }

  private finish() {
    const open = this.p.open;
    if (!open) return;
    this.p.open = null;
    const stats = { ...open, samples: thin(open.samples, MAX_SAMPLES) };
    this.p.finished.push(stats);
    this.storage.save(this.key, this.p);
    this.sink.station(stats);
  }

  /** Stationen erneut senden, die der Server noch nicht bestätigt hat. */
  resendMissing(acked: readonly number[]) {
    for (const s of this.p.finished) if (!acked.includes(s.round)) this.sink.station(s);
  }

  private report(now: number, round: number | null): ChickReport {
    const s = this.p.state;
    return {
      at: now,
      round,
      needs: s.needs,
      urgentMs: s.urgentMs,
      wellbeing: Math.max(0, Math.min(1, s.wellbeing)),
      alive: s.alive,
      stationLoss: s.stationLoss,
    };
  }
}

/** Gleichmäßig ausdünnen, erster und letzter Punkt bleiben. */
export function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const out: T[] = [];
  for (let i = 0; i < max; i++)
    out.push(items[Math.round((i * (items.length - 1)) / (max - 1))] as T);
  return out;
}
