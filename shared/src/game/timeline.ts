/**
 * Rundentakt als reine Rechnung über Server-Zeit.
 *
 * Der Server legt einen Startzeitpunkt `t0` fest; daraus folgt für jede Runde r:
 *   Station:   [t0 + r·(S+H),  t0 + r·(S+H) + S)
 *   Weitergabe: [Stationsende, Start der nächsten Runde)      (nicht nach der letzten Runde)
 * Alle Geräte rechnen mit derselben Formel und ihrer abgeglichenen Uhr – so erscheint
 * „Weiter!“ überall gleichzeitig, ohne dass der Server im Moment selbst etwas senden muss.
 * Pause, Fortsetzen und Überspringen verschieben nur `t0` (immer mit Vorlauf in die Zukunft).
 */
export interface Timeline {
  /** Server-Zeit, zu der Runde 0 beginnt. */
  t0: number;
  stationMs: number;
  handoverMs: number;
  rounds: number;
  /** Server-Zeit, zu der pausiert wurde; null = läuft. */
  pausedAt: number | null;
}

export type TimelinePosition =
  | { stage: 'before'; startsAt: number; paused: boolean }
  | { stage: 'station'; round: number; startsAt: number; endsAt: number; paused: boolean }
  | {
      stage: 'handover';
      /** Runde, die gerade zu Ende ging. */
      round: number;
      nextRound: number;
      endsAt: number;
      paused: boolean;
    }
  | { stage: 'done'; endedAt: number; paused: boolean };

export function createTimeline(opts: {
  startsAt: number;
  stationMs: number;
  handoverMs: number;
  rounds: number;
}): Timeline {
  if (opts.rounds < 1) throw new Error('Mindestens eine Runde');
  if (opts.stationMs <= 0 || opts.handoverMs < 0) throw new Error('Ungültige Dauer');
  return {
    t0: opts.startsAt,
    stationMs: opts.stationMs,
    handoverMs: opts.handoverMs,
    rounds: opts.rounds,
    pausedAt: null,
  };
}

const period = (tl: Timeline) => tl.stationMs + tl.handoverMs;

export const roundStartsAt = (tl: Timeline, round: number) => tl.t0 + round * period(tl);
export const roundEndsAt = (tl: Timeline, round: number) => roundStartsAt(tl, round) + tl.stationMs;
export const timelineEndsAt = (tl: Timeline) => roundEndsAt(tl, tl.rounds - 1);

/** Wo steht der Takt zum Zeitpunkt `now` (Server-Zeit)? */
export function positionAt(tl: Timeline, now: number): TimelinePosition {
  const paused = tl.pausedAt !== null;
  const t = paused ? Math.min(now, tl.pausedAt as number) : now;
  if (t < tl.t0) return { stage: 'before', startsAt: tl.t0, paused };
  const end = timelineEndsAt(tl);
  if (t >= end) return { stage: 'done', endedAt: end, paused };
  const round = Math.floor((t - tl.t0) / period(tl));
  const startsAt = roundStartsAt(tl, round);
  const endsAt = startsAt + tl.stationMs;
  if (t < endsAt) return { stage: 'station', round, startsAt, endsAt, paused };
  return { stage: 'handover', round, nextRound: round + 1, endsAt: startsAt + period(tl), paused };
}

/** Restzeit des aktuellen Abschnitts in ms (bei Pause eingefroren). */
export function msLeft(tl: Timeline, now: number): number {
  const pos = positionAt(tl, now);
  const t = tl.pausedAt !== null ? Math.min(now, tl.pausedAt) : now;
  switch (pos.stage) {
    case 'before':
      return pos.startsAt - t;
    case 'station':
    case 'handover':
      return pos.endsAt - t;
    case 'done':
      return 0;
  }
}

/** Nächster Zeitpunkt, an dem sich die Position ändert (für den Server-Timer); null = nie. */
export function nextBoundary(tl: Timeline, now: number): number | null {
  if (tl.pausedAt !== null) return null;
  const pos = positionAt(tl, now);
  switch (pos.stage) {
    case 'before':
      return pos.startsAt;
    case 'station':
    case 'handover':
      return pos.endsAt;
    case 'done':
      return null;
  }
}

export function pauseTimeline(tl: Timeline, now: number): Timeline {
  if (tl.pausedAt !== null || positionAt(tl, now).stage === 'done') return tl;
  return { ...tl, pausedAt: now };
}

/** Fortsetzen zum Zeitpunkt `resumeAt` (in der Zukunft, damit alle Geräte gleichzeitig weitermachen). */
export function resumeTimeline(tl: Timeline, resumeAt: number): Timeline {
  if (tl.pausedAt === null) return tl;
  return { ...tl, t0: tl.t0 + (resumeAt - tl.pausedAt), pausedAt: null };
}

/**
 * Aktuellen Abschnitt (Station, Weitergabe oder Wartezeit) verkürzen, sodass er bei
 * `now + leadMs` endet. Ist er ohnehin früher vorbei, bleibt alles, wie es ist.
 */
export function skipStage(tl: Timeline, now: number, leadMs: number): Timeline {
  if (tl.pausedAt !== null) return tl;
  const boundary = nextBoundary(tl, now);
  if (boundary === null) return tl;
  const target = now + leadMs;
  if (boundary <= target) return tl;
  return { ...tl, t0: tl.t0 - (boundary - target) };
}
