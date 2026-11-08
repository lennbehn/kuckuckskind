/**
 * Deterministischer Zufallsgenerator (mulberry32). Spiellogik bekommt immer einen
 * `Rng` hereingereicht, damit Tests und Simulationen reproduzierbar sind.
 */
export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganzzahl in [min, max]. */
  int(min: number, max: number): number;
  /** Zufälliges Element. */
  pick<T>(items: readonly T[]): T;
  /** Neue Liste, gemischt (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Exponentialverteilte Wartezeit mit gegebenem Mittelwert. */
  exponential(mean: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick(items) {
      if (items.length === 0) throw new Error('pick() aus leerer Liste');
      return items[int(0, items.length - 1)] as (typeof items)[number];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
    exponential(mean) {
      return -Math.log(1 - next()) * mean;
    },
  };
}
