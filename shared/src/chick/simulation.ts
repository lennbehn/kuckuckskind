import { z } from 'zod';
import {
  CareKindSchema,
  NEED_FOR_CARE,
  NeedSchema,
  type CareKind,
  type GameConfig,
  type Need,
} from '../config/schema.ts';
import type { Rng } from '../game/rng.ts';
import type { NeedModifiers } from '../modules/types.ts';
import { careFactor, type Character } from './character.ts';

/**
 * Bedürfnis-Simulation eines Kükens – rein und deterministisch.
 *
 * Läuft auf dem Handy des Eigentümers (das Küken lebt dort), egal wer es gerade hält.
 * Pro Zeitschritt:
 *   1. Aktive Bedürfnisse wachsen (Tempo × Modul-Faktoren).
 *   2. Pflege lindert das passende Bedürfnis (× Charakter-Faktor). Pflege, obwohl gestillt =
 *      übertrieben; Pflege für ein kaum vorhandenes Bedürfnis, während ein anderes dringend ist =
 *      falsch. Beides schadet. Zu wildes Wiegen schadet immer.
 *   3. Bleibt ein Bedürfnis länger als die Vernachlässigungsschwelle dringend, schadet es.
 *   4. Gesamtverlust je Station ist gedeckelt (Sabotage-Limit).
 *   5. Ohne Verlust und mit allen Bedürfnissen unter „zufrieden“ erholt sich das Küken.
 */

export interface ChickState {
  needs: Record<Need, number>;
  /** Wie lange jedes Bedürfnis schon ununterbrochen dringend ist (ms). */
  urgentMs: Record<Need, number>;
  /** Befinden 0…1. */
  wellbeing: number;
  alive: boolean;
  /** Verlust in der laufenden Station (für das Sabotage-Limit). */
  stationLoss: number;
}

/** Was der Halter gerade tut. */
export interface CareInput {
  /** Laufende Pflege (z. B. pustet + deckt zu). */
  active: readonly CareKind[];
  /** Zu wild geschüttelt. */
  rough: boolean;
}

export const NO_CARE: CareInput = { active: [], rough: false };

const zeroNeeds = (): Record<Need, number> => ({
  heat: 0,
  restless: 0,
  tired: 0,
  hunger: 0,
  bored: 0,
});

export const activeNeeds = (config: GameConfig): Need[] =>
  config.care.activeKinds.map((k) => NEED_FOR_CARE[k]);

export function initialChick(config: GameConfig, rng: Rng): ChickState {
  const needs = zeroNeeds();
  for (const n of activeNeeds(config)) needs[n] = rng.next() * config.needs.initialMax;
  return { needs, urgentMs: zeroNeeds(), wellbeing: 1, alive: true, stationLoss: 0 };
}

// ---------------------------------------------------------------------------
// Statistik je Station (Grundlage für vage Hinweise und Spick-Aufzeichnung)
// ---------------------------------------------------------------------------

const msRecord = z.partialRecord(CareKindSchema, z.number().nonnegative());

/** Ein Aufzeichnungspunkt (kompakt): Zeit seit Stationsbeginn, Befinden, Bedürfnisse, Pflege. */
export const SampleSchema = z.object({
  t: z.number().nonnegative(),
  w: z.number(),
  /** Bedürfnisse in der Reihenfolge der aktiven Pflegearten. */
  n: z.array(z.number()),
  /** Laufende Pflege; `rough` = zu wild. */
  c: z.array(z.union([CareKindSchema, z.literal('rough')])),
});
export type Sample = z.infer<typeof SampleSchema>;

export const StationStatsSchema = z.object({
  round: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  wellbeingStart: z.number(),
  wellbeingEnd: z.number(),
  loss: z.number().nonnegative(),
  reliefMs: msRecord,
  overcareMs: msRecord,
  /** Falsche Pflege: Schlüssel "need>care" (z. B. "heat>rock"). */
  wrongCareMs: z.record(z.string(), z.number().nonnegative()),
  roughMs: z.number().nonnegative(),
  /** Zeit, in der Vernachlässigung je Bedürfnis geschadet hat. */
  neglectMs: z.partialRecord(NeedSchema, z.number().nonnegative()),
  neglectLoss: z.number().nonnegative(),
  likedMs: z.number().nonnegative(),
  dislikedMs: z.number().nonnegative(),
  died: z.boolean(),
  samples: z.array(SampleSchema).max(2000),
});
export type StationStats = z.infer<typeof StationStatsSchema>;

export function emptyStats(round: number, wellbeing: number): StationStats {
  return {
    round,
    durationMs: 0,
    wellbeingStart: wellbeing,
    wellbeingEnd: wellbeing,
    loss: 0,
    reliefMs: {},
    overcareMs: {},
    wrongCareMs: {},
    roughMs: 0,
    neglectMs: {},
    neglectLoss: 0,
    likedMs: 0,
    dislikedMs: 0,
    died: false,
    samples: [],
  };
}

const add = <K extends string>(rec: Partial<Record<K, number>>, key: K, v: number) => {
  rec[key] = (rec[key] ?? 0) + v;
};

// ---------------------------------------------------------------------------
// Zeitschritt
// ---------------------------------------------------------------------------

export interface StepEnv {
  config: GameConfig;
  character: Character;
  modifiers?: NeedModifiers;
}

/**
 * Simuliert `dtMs` (klein halten, ≤ 250 ms). Gibt den neuen Zustand zurück und schreibt
 * in `stats`, falls angegeben.
 */
export function stepChick(
  prev: ChickState,
  input: CareInput,
  dtMs: number,
  env: StepEnv,
  stats?: StationStats,
): ChickState {
  if (!prev.alive || dtMs <= 0) return prev;
  const { config, character, modifiers } = env;
  const c = config.needs;
  const dt = dtMs / 1000;
  const needsList = activeNeeds(config);
  const state: ChickState = {
    ...prev,
    needs: { ...prev.needs },
    urgentMs: { ...prev.urgentMs },
  };

  // 1. Wachstum
  for (const n of needsList) {
    const factor = modifiers?.growthFactor?.[n] ?? 1;
    const extra = modifiers?.extraGrowthPerSecond?.[n] ?? 0;
    state.needs[n] = Math.min(
      1,
      state.needs[n] + (c[n].growthPerSecond * c.tempo * factor + extra) * dt,
    );
  }

  // 2. Pflege
  let harm = 0;
  const urgentNeed = needsList.find((n) => state.needs[n] >= c[n].urgentLevel);
  for (const kind of new Set(input.active)) {
    if (!config.care.activeKinds.includes(kind)) continue;
    const need = NEED_FOR_CARE[kind];
    const level = state.needs[need];
    const f = careFactor(kind, character, config);
    if (stats) {
      if (character.likes.includes(kind)) stats.likedMs += dtMs;
      if (character.dislikes.includes(kind)) stats.dislikedMs += dtMs;
    }
    if (level <= c.satisfiedLevel) {
      harm += config.sabotage.overcareHarmPerSecond * dt;
      if (stats) add(stats.overcareMs, kind, dtMs);
      continue;
    }
    if (level < c.wrongCareMaxLevel && urgentNeed && urgentNeed !== need) {
      harm += config.sabotage.wrongCareHarmPerSecond * dt;
      if (stats) add(stats.wrongCareMs, `${urgentNeed}>${kind}`, dtMs);
    } else if (stats) {
      add(stats.reliefMs, kind, dtMs);
    }
    state.needs[need] = Math.max(0, level - c[need].reliefPerSecond * f * dt);
  }
  if (input.rough) {
    harm += config.sabotage.roughRockHarmPerSecond * dt;
    if (stats) stats.roughMs += dtMs;
  }

  // 3. Vernachlässigung
  let neglect = 0;
  for (const n of needsList) {
    if (state.needs[n] >= c[n].urgentLevel) {
      state.urgentMs[n] += dtMs;
      if (state.urgentMs[n] > c.neglectThresholdSeconds * 1000) {
        neglect += c.neglectDamagePerSecond * dt;
        if (stats) add(stats.neglectMs, n, dtMs);
      }
    } else {
      state.urgentMs[n] = 0;
    }
  }

  // 4. Verlust mit Sabotage-Limit je Station
  const wanted = harm + neglect;
  const allowed = Math.max(0, config.sabotage.maxHarmPerStation - state.stationLoss);
  const loss = Math.min(wanted, allowed);
  state.stationLoss += loss;
  state.wellbeing -= loss;
  if (stats) {
    stats.loss += loss;
    stats.neglectLoss += wanted > 0 ? loss * (neglect / wanted) : 0;
  }

  // 5. Erholung
  const content = needsList.every((n) => state.needs[n] < c.contentLevel);
  if (wanted === 0 && content)
    state.wellbeing = Math.min(1, state.wellbeing + c.recoveryPerSecond * dt);

  if (state.wellbeing <= config.scoring.survivalMin) {
    state.wellbeing = Math.max(0, state.wellbeing);
    state.alive = false;
    if (stats) stats.died = true;
  }
  if (stats) {
    stats.durationMs += dtMs;
    stats.wellbeingEnd = state.wellbeing;
  }
  return state;
}

/** Neue Station: Sabotage-Limit zurücksetzen. */
export const startStation = (s: ChickState): ChickState => ({ ...s, stationLoss: 0 });

/** Aufzeichnungspunkt für die Spick-Station. */
export function sample(state: ChickState, input: CareInput, t: number, config: GameConfig): Sample {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    t: Math.round(t),
    w: r(state.wellbeing),
    n: config.care.activeKinds.map((k) => r(state.needs[NEED_FOR_CARE[k]])),
    c: [...input.active, ...(input.rough ? (['rough'] as const) : [])],
  };
}

/** Dringendstes Bedürfnis (für Hinweisfeld/Gesicht). */
export function mostUrgent(state: ChickState, config: GameConfig): Need | null {
  let best: Need | null = null;
  for (const n of activeNeeds(config))
    if (best === null || state.needs[n] > state.needs[best]) best = n;
  return best;
}
