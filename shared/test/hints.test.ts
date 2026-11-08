import { describe, expect, it } from 'vitest';
import {
  createRng,
  describePeek,
  emptyStats,
  generateHints,
  resolveConfig,
  type StationStats,
} from '../src/index.ts';

const config = resolveConfig();
const character = { likes: ['blow' as const], dislikes: ['cover' as const] };

const station = (round: number, patch: Partial<StationStats>): StationStats => ({
  ...emptyStats(round, 1),
  durationMs: 60_000,
  ...patch,
});

describe('Vage Hinweise', () => {
  it('nennen nie Namen, Runden oder Reihenfolge', () => {
    const hints = generateHints(
      [
        station(0, { roughMs: 4000, loss: 0.2 }),
        station(1, { neglectMs: { tired: 8000 }, loss: 0.1 }),
        station(2, { overcareMs: { blow: 5000 }, loss: 0.1 }),
        station(3, { wrongCareMs: { 'heat>rock': 3000 } }),
      ],
      character,
      config,
      createRng(1),
    );
    expect(hints).toHaveLength(config.hints.perChick);
    for (const h of hints) expect(h).not.toMatch(/Runde|zuerst|zuletzt|dann|danach|p\d/);
  });

  it('wichtigste Ereignisse zuerst ausgewählt (Tod, Schütteln)', () => {
    const hints = generateHints(
      [
        station(0, { died: true }),
        station(1, { roughMs: 5000 }),
        station(2, { likedMs: 9000 }),
        station(3, { dislikedMs: 9000 }),
      ],
      character,
      { ...config, hints: { perChick: 2 } },
      createRng(2),
    );
    expect(hints.join(' ')).toMatch(/nicht mehr konnte/);
    expect(hints.join(' ')).toMatch(/geschüttelt/);
  });

  it('ruhige Partie ergibt einen ruhigen Hinweis', () => {
    expect(generateHints([station(0, {})], character, config, createRng(3))).toEqual([
      'Eigentlich war alles ganz ruhig.',
    ]);
  });

  it('gleiche Sätze nur einmal', () => {
    const hints = generateHints(
      [station(0, { roughMs: 3000 }), station(1, { roughMs: 3000 }), station(2, { roughMs: 3000 })],
      character,
      config,
      createRng(4),
    );
    expect(new Set(hints).size).toBe(hints.length);
  });

  it('falsche Pflege wird verständlich beschrieben', () => {
    const [hint] = generateHints(
      [station(0, { wrongCareMs: { 'heat>rock': 4000 } })],
      character,
      { ...config, hints: { perChick: 1 } },
      createRng(5),
    );
    expect(hint).toBe('Einmal war mir ganz heiß, aber ich wurde nur gewiegt.');
  });
});

describe('Spick-Station', () => {
  it('beschreibt genau, was passiert ist', () => {
    const lines = describePeek(
      station(2, {
        reliefMs: { blow: 12_000 },
        overcareMs: { cover: 3000 },
        wrongCareMs: { 'tired>rock': 2000 },
        roughMs: 4000,
        neglectMs: { heat: 6000 },
        wellbeingStart: 0.9,
        wellbeingEnd: 0.6,
      }),
    );
    expect(lines).toEqual([
      '12 s richtig gepustet',
      '3 s zugedeckt, obwohl es nicht nötig war',
      '2 s sanft gewiegt, obwohl Müdigkeit dringender war',
      '4 s zu wild geschüttelt',
      '6 s vernachlässigt (Pusten fehlte)',
      'Danach ging es mir schlechter (−30 %).',
    ]);
  });
});
