import { describe, expect, it } from 'vitest';
import {
  createTimeline,
  msLeft,
  nextBoundary,
  pauseTimeline,
  positionAt,
  resumeTimeline,
  skipStage,
  timelineEndsAt,
} from '../src/index.ts';

// 3 Runden à 60 s Station + 5 s Weitergabe, Start bei t = 1000.
const tl = createTimeline({ startsAt: 1000, stationMs: 60_000, handoverMs: 5_000, rounds: 3 });

describe('Rundentakt', () => {
  it('kennt alle Abschnitte', () => {
    expect(positionAt(tl, 0)).toMatchObject({ stage: 'before', startsAt: 1000 });
    expect(positionAt(tl, 1000)).toMatchObject({ stage: 'station', round: 0, endsAt: 61_000 });
    expect(positionAt(tl, 61_000)).toMatchObject({
      stage: 'handover',
      round: 0,
      nextRound: 1,
      endsAt: 66_000,
    });
    expect(positionAt(tl, 66_000)).toMatchObject({ stage: 'station', round: 1 });
    expect(positionAt(tl, 131_000 + 60_000 - 1)).toMatchObject({ stage: 'station', round: 2 });
  });

  it('nach der letzten Station gibt es keine Weitergabe', () => {
    expect(timelineEndsAt(tl)).toBe(1000 + 2 * 65_000 + 60_000);
    expect(positionAt(tl, timelineEndsAt(tl))).toMatchObject({ stage: 'done' });
    expect(nextBoundary(tl, timelineEndsAt(tl))).toBeNull();
  });

  it('nächste Grenze und Restzeit', () => {
    expect(nextBoundary(tl, 0)).toBe(1000);
    expect(nextBoundary(tl, 30_000)).toBe(61_000);
    expect(nextBoundary(tl, 62_000)).toBe(66_000);
    expect(msLeft(tl, 31_000)).toBe(30_000);
  });

  it('Pause friert die Zeit ein, Fortsetzen verschiebt alles', () => {
    const paused = pauseTimeline(tl, 31_000);
    expect(msLeft(paused, 90_000)).toBe(30_000);
    expect(positionAt(paused, 500_000)).toMatchObject({ stage: 'station', round: 0, paused: true });
    expect(nextBoundary(paused, 40_000)).toBeNull();

    const resumed = resumeTimeline(paused, 100_000);
    expect(resumed.pausedAt).toBeNull();
    expect(positionAt(resumed, 100_000)).toMatchObject({
      stage: 'station',
      round: 0,
      endsAt: 130_000,
    });
    expect(msLeft(resumed, 100_000)).toBe(30_000);
  });

  it('doppeltes Pausieren und Fortsetzen ohne Pause ändern nichts', () => {
    const p = pauseTimeline(tl, 10_000);
    expect(pauseTimeline(p, 20_000)).toBe(p);
    expect(resumeTimeline(tl, 50_000)).toBe(tl);
  });

  it('Überspringen beendet den Abschnitt mit Vorlauf', () => {
    const s = skipStage(tl, 10_000, 1500);
    expect(positionAt(s, 11_499)).toMatchObject({ stage: 'station', round: 0 });
    expect(positionAt(s, 11_500)).toMatchObject({ stage: 'handover', round: 0 });
    // Weitere Runden behalten ihre volle Länge.
    expect(positionAt(s, 16_500)).toMatchObject({ stage: 'station', round: 1, endsAt: 76_500 });
  });

  it('Überspringen kurz vor Ende oder in Pause ändert nichts', () => {
    expect(skipStage(tl, 60_000, 1500)).toBe(tl);
    const p = pauseTimeline(tl, 10_000);
    expect(skipStage(p, 10_000, 1500)).toBe(p);
  });

  it('lehnt unsinnige Takte ab', () => {
    expect(() =>
      createTimeline({ startsAt: 0, stationMs: 1000, handoverMs: 0, rounds: 0 }),
    ).toThrow();
    expect(() => createTimeline({ startsAt: 0, stationMs: 0, handoverMs: 0, rounds: 1 })).toThrow();
  });
});
