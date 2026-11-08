import { describe, expect, it } from 'vitest';
import {
  NO_CARE,
  createRng,
  emptyStats,
  initialChick,
  resolveConfig,
  rollCharacter,
  sample,
  startStation,
  stepChick,
  type CareInput,
  type Character,
  type ChickState,
  type StationStats,
} from '../src/index.ts';

const config = resolveConfig();
const neutral: Character = { likes: [], dislikes: [] };
const env = { config, character: neutral };

/** `ms` lang mit konstanter Eingabe simulieren. */
function run(
  state: ChickState,
  input: CareInput | ((s: ChickState) => CareInput),
  ms: number,
  stats?: StationStats,
  e = env,
) {
  let s = state;
  for (let t = 0; t < ms; t += 100)
    s = stepChick(s, typeof input === 'function' ? input(s) : input, 100, e, stats);
  return s;
}

const fresh = (): ChickState => ({
  needs: { heat: 0.2, restless: 0.2, tired: 0.2, hunger: 0, bored: 0 },
  urgentMs: { heat: 0, restless: 0, tired: 0, hunger: 0, bored: 0 },
  wellbeing: 1,
  alive: true,
  stationLoss: 0,
});

describe('Bedürfnis-Simulation', () => {
  it('Bedürfnisse wachsen mit Tempo; inaktive bleiben 0', () => {
    const s = run(fresh(), NO_CARE, 10_000);
    expect(s.needs.heat).toBeCloseTo(0.2 + 10 * config.needs.heat.growthPerSecond, 5);
    expect(s.needs.hunger).toBe(0);
    const fast = run(fresh(), NO_CARE, 10_000, undefined, {
      config: resolveConfig({ needs: { tempo: 2 } }),
      character: neutral,
    });
    expect(fast.needs.heat).toBeGreaterThan(s.needs.heat);
  });

  it('passende Pflege lindert, Lieblingspflege stärker, ungeliebte schwächer', () => {
    const blow: CareInput = { active: ['blow'], rough: false };
    const base = { ...fresh(), needs: { ...fresh().needs, heat: 0.8 } };
    const plain = run(base, blow, 1000);
    const liked = run(base, blow, 1000, undefined, {
      config,
      character: { likes: ['blow'], dislikes: [] },
    });
    const disliked = run(base, blow, 1000, undefined, {
      config,
      character: { likes: [], dislikes: ['blow'] },
    });
    expect(plain.needs.heat).toBeLessThan(0.8);
    expect(liked.needs.heat).toBeLessThan(plain.needs.heat);
    expect(disliked.needs.heat).toBeGreaterThan(plain.needs.heat);
  });

  it('Vernachlässigung schadet erst nach der Schwelle', () => {
    const urgent = { ...fresh(), needs: { ...fresh().needs, tired: 0.9 } };
    const stats = emptyStats(0, 1);
    const before = run(urgent, NO_CARE, config.needs.neglectThresholdSeconds * 1000 - 200, stats);
    expect(before.wellbeing).toBe(1);
    const after = run(before, NO_CARE, 5000, stats);
    expect(after.wellbeing).toBeLessThan(1);
    expect(stats.neglectMs.tired).toBeGreaterThan(0);
    expect(stats.neglectLoss).toBeGreaterThan(0);
  });

  it('übertriebene Pflege schadet', () => {
    const calm = { ...fresh(), needs: { heat: 0, restless: 0.1, tired: 0.1, hunger: 0, bored: 0 } };
    const stats = emptyStats(0, 1);
    const s = run(calm, { active: ['blow'], rough: false }, 1000, stats);
    expect(s.wellbeing).toBeLessThan(1);
    expect(stats.overcareMs.blow).toBeGreaterThan(0);
  });

  it('falsche Pflege: wenig nötiges Bedürfnis gepflegt, während ein anderes dringend ist', () => {
    const s0 = {
      ...fresh(),
      needs: { heat: 0.9, restless: 0.15, tired: 0.1, hunger: 0, bored: 0 },
    };
    const stats = emptyStats(0, 1);
    run(s0, { active: ['rock'], rough: false }, 1000, stats);
    expect(stats.wrongCareMs['heat>rock']).toBeGreaterThan(0);
  });

  it('zu wildes Wiegen schadet immer', () => {
    const stats = emptyStats(0, 1);
    const s = run(fresh(), { active: [], rough: true }, 2000, stats);
    expect(s.wellbeing).toBeCloseTo(1 - 2 * config.sabotage.roughRockHarmPerSecond, 5);
    expect(stats.roughMs).toBe(2000);
  });

  it('Sabotage-Limit deckelt den Verlust je Station', () => {
    const stats = emptyStats(0, 1);
    const s = run(fresh(), { active: [], rough: true }, 60_000, stats);
    expect(1 - s.wellbeing).toBeCloseTo(config.sabotage.maxHarmPerStation, 5);
    expect(stats.loss).toBeCloseTo(config.sabotage.maxHarmPerStation, 5);
    const next = run(startStation(s), { active: [], rough: true }, 1000);
    expect(next.wellbeing).toBeLessThan(s.wellbeing);
  });

  it('erholt sich, wenn nichts drückt', () => {
    const s0 = {
      ...fresh(),
      wellbeing: 0.5,
      needs: { heat: 0.1, restless: 0.1, tired: 0.1, hunger: 0, bored: 0 },
    };
    expect(run(s0, NO_CARE, 2000).wellbeing).toBeGreaterThan(0.5);
  });

  it('stirbt bei Befinden 0 und bleibt dann unverändert', () => {
    const s0 = { ...fresh(), wellbeing: 0.05 };
    const stats = emptyStats(0, 0.05);
    const dead = run(s0, { active: [], rough: true }, 3000, stats);
    expect(dead.alive).toBe(false);
    expect(stats.died).toBe(true);
    expect(stepChick(dead, { active: ['blow'], rough: false }, 1000, env)).toBe(dead);
  });

  it('Anfangszustand nur mit aktiven Bedürfnissen, reproduzierbar', () => {
    const a = initialChick(config, createRng(5));
    expect(a).toEqual(initialChick(config, createRng(5)));
    expect(a.needs.hunger).toBe(0);
    expect(a.needs.heat).toBeLessThanOrEqual(config.needs.initialMax);
  });

  it('Charakter: Vorlieben und Abneigungen überschneiden sich nie', () => {
    for (let seed = 0; seed < 50; seed++) {
      const c = rollCharacter(config, createRng(seed));
      expect(c.likes).toHaveLength(1);
      expect(c.dislikes).toHaveLength(1);
      expect(c.likes[0]).not.toBe(c.dislikes[0]);
    }
  });

  it('Aufzeichnungspunkte sind kompakt', () => {
    const p = sample(fresh(), { active: ['blow'], rough: true }, 1234.6, config);
    expect(p).toEqual({ t: 1235, w: 1, n: [0.2, 0.2, 0.2], c: ['blow', 'rough'] });
  });

  it('gute Pflege hält ein Küken über eine Station glücklich, Nichtstun nicht', () => {
    const good = (s: ChickState): CareInput => ({
      active: config.care.activeKinds.filter(
        (k) =>
          s.needs[
            { blow: 'heat', rock: 'restless', cover: 'tired', feed: 'hunger', sing: 'bored' }[
              k
            ] as 'heat'
          ] > 0.3,
      ),
      rough: false,
    });
    const cared = run(fresh(), good, 120_000);
    const ignored = run(fresh(), NO_CARE, 120_000);
    expect(cared.wellbeing).toBeGreaterThan(0.9);
    expect(ignored.wellbeing).toBeLessThan(cared.wellbeing - 0.2);
  });
});
