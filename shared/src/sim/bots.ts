import { CARE_FOR_NEED, type CareKind, type GameConfig, type Need } from '../config/schema.ts';
import type { Rng } from '../game/rng.ts';
import { activeNeeds, type CareInput, type ChickState } from '../chick/simulation.ts';

/**
 * Simulierte Halter: entscheiden in jedem Zeitschritt, welche Pflege sie geben – nur aus dem,
 * was ein Mensch sieht (Bedürfnisse ab einem gewissen Pegel). Für Tests, Balancing und den
 * Bot-Modus im Browser.
 */
export interface BotView {
  state: ChickState;
  config: GameConfig;
  /** Zeit seit Stationsbeginn (ms). */
  t: number;
  rng: Rng;
}

/** Eine Bot-Instanz pflegt eine Station; sie darf internen Zustand haben. */
export type BotPolicy = (view: BotView) => CareInput;

export interface FosterBotOptions {
  /** Ab diesem Pegel bemerkt der Bot ein Bedürfnis. */
  noticeLevel: number;
  /** Reaktionszeit nach dem Bemerken (ms). */
  reactionMs: number;
  /** Hört auf, wenn das Bedürfnis darunter ist. */
  stopLevel: number;
  /** Wie viele Pflegen gleichzeitig. */
  parallel: number;
  /** Wahrscheinlichkeit je Sekunde, versehentlich zu wild zu wiegen. */
  roughPerSecond: number;
}

export const GOOD_FOSTER: FosterBotOptions = {
  noticeLevel: 0.35,
  reactionMs: 1500,
  stopLevel: 0.1,
  parallel: 2,
  roughPerSecond: 0.01,
};

export const CLUMSY_FOSTER: FosterBotOptions = {
  noticeLevel: 0.45,
  reactionMs: 4000,
  stopLevel: 0.02,
  parallel: 1,
  roughPerSecond: 0.04,
};

export function fosterBot(opts: FosterBotOptions = GOOD_FOSTER): BotPolicy {
  const noticedAt = new Map<Need, number>();
  const caring = new Set<Need>();
  let roughUntil = -1;
  let lastT = 0;
  return ({ state, config, t, rng }) => {
    const dt = t - lastT;
    lastT = t;
    for (const n of activeNeeds(config)) {
      const level = state.needs[n];
      if (level >= opts.noticeLevel && !noticedAt.has(n)) noticedAt.set(n, t);
      if (caring.has(n) && level <= opts.stopLevel) {
        caring.delete(n);
        noticedAt.delete(n);
      }
    }
    const ready = [...noticedAt.entries()]
      .filter(([n, at]) => !caring.has(n) && t - at >= opts.reactionMs)
      .sort((a, b) => state.needs[b[0]] - state.needs[a[0]]);
    for (const [n] of ready) if (caring.size < opts.parallel) caring.add(n);
    if (rng.next() < (opts.roughPerSecond * dt) / 1000) roughUntil = t + 800;
    return { active: [...caring].map((n) => CARE_FOR_NEED[n]), rough: t < roughUntil };
  };
}

export type SabotageStrategy = 'idle' | 'late' | 'wrong' | 'over' | 'rough';

export interface CuckooBotOptions {
  /** Anteil der Stationszeit, in dem sabotiert wird (der Rest sieht normal aus). */
  intensity: number;
  strategies: SabotageStrategy[];
}

export const SNEAKY_CUCKOO: CuckooBotOptions = {
  intensity: 0.6,
  strategies: ['idle', 'late', 'wrong', 'over'],
};

/** Kuckuck: wirkt teils wie normale Pflege, sabotiert aber einen Teil der Zeit leise. */
export function cuckooBot(opts: CuckooBotOptions = SNEAKY_CUCKOO, rng: Rng): BotPolicy {
  const strategy = rng.pick(opts.strategies);
  const normal = fosterBot(
    strategy === 'late' ? { ...GOOD_FOSTER, reactionMs: 12_000 } : GOOD_FOSTER,
  );
  const sabotageFrom = (1 - opts.intensity) * 0.5; // Sabotage in der Mitte der Station
  return (view) => {
    const care = normal(view);
    const stationMs = view.config.timing.stationSeconds * 1000;
    const p = view.t / stationMs;
    if (p < sabotageFrom || p > sabotageFrom + opts.intensity) return care;
    const kinds = view.config.care.activeKinds;
    switch (strategy) {
      case 'idle':
        return { active: [], rough: false };
      case 'late':
        return care;
      case 'rough':
        return { active: care.active, rough: true };
      case 'wrong': {
        // Pflege für das am wenigsten dringende Bedürfnis.
        const least = [...kinds].sort(
          (a, b) => view.state.needs[needOf(a)] - view.state.needs[needOf(b)],
        )[0];
        return { active: least ? [least] : [], rough: false };
      }
      case 'over': {
        const satisfied = kinds.filter(
          (k) => view.state.needs[needOf(k)] <= view.config.needs.satisfiedLevel,
        );
        return { active: satisfied.length ? satisfied : care.active, rough: false };
      }
    }
  };
}

const needOf = (k: CareKind): Need =>
  (Object.entries(CARE_FOR_NEED).find(([, c]) => c === k)?.[0] ?? 'heat') as Need;
