import { NEED_FOR_CARE, type ChickState, type GameConfig, type Need } from '@kuckuckskind/shared';

/**
 * Parametrisches Küken: Gesichtsausdruck und Haltung als Zahlenwerte.
 * Stimmungen sind Wertesätze; der Ausdruck entsteht durch Mischen und stufenlose
 * Feder-Übergänge. Alle Formen werden aus diesen Werten gebaut und haben in jeder
 * Stimmung gleich viele Punkte (siehe chickGeometry.ts, docs/kueken-bausteine.md).
 */
export interface ChickParams {
  /** Mundwinkel −1 (traurig) … 1 (lächelnd). */
  mouth: number;
  /** Schnabel geöffnet 0…1. */
  mouthOpen: number;
  /** Augen offen 0 (zu) … 1 (ganz offen). */
  eyeOpen: number;
  /** Lach-Augen („^ ^“) 0…1. */
  eyeSmile: number;
  /** Brauen −1 (besorgt, innen hoch) … 1 (grimmig, innen tief). */
  browAngle: number;
  /** Brauen angehoben 0…1. */
  browRaise: number;
  /** Schopf 0 (hängt) … 1 (steht keck). */
  tuft: number;
  /** Flügel −1 (hängen) … 1 (gehoben). */
  wingLift: number;
  /** Tränen 0…1. */
  tears: number;
  /** Wangenröte 0…1. */
  blush: number;
  /** Blattöhrchen hängen 0…1. */
  earDroop: number;
  /** Kuckucks-Färbung (nur Enthüllung) 0…1. */
  cuckoo: number;
}

export type Mood =
  'content' | 'happy' | 'worried' | 'sad' | 'crying' | 'sleepy' | 'hot' | 'jittery' | 'gone';

const base: ChickParams = {
  mouth: 0.3,
  mouthOpen: 0,
  eyeOpen: 1,
  eyeSmile: 0,
  browAngle: 0,
  browRaise: 0.2,
  tuft: 0.6,
  wingLift: 0,
  tears: 0,
  blush: 0.3,
  earDroop: 0.2,
  cuckoo: 0,
};

export const MOODS: Record<Mood, ChickParams> = {
  content: base,
  happy: {
    ...base,
    mouth: 1,
    mouthOpen: 0.35,
    eyeSmile: 1,
    browRaise: 0.5,
    tuft: 1,
    wingLift: 0.5,
    blush: 0.75,
    earDroop: 0,
  },
  worried: {
    ...base,
    mouth: -0.3,
    browAngle: -0.7,
    browRaise: 0.6,
    tuft: 0.4,
    wingLift: -0.2,
    blush: 0.2,
    earDroop: 0.45,
  },
  sad: {
    ...base,
    mouth: -0.8,
    eyeOpen: 0.7,
    browAngle: -1,
    browRaise: 0.3,
    tuft: 0.15,
    wingLift: -0.7,
    tears: 0.3,
    blush: 0.1,
    earDroop: 0.8,
  },
  crying: {
    ...base,
    mouth: -1,
    mouthOpen: 0.6,
    eyeOpen: 0.45,
    browAngle: -1,
    browRaise: 0.7,
    tuft: 0.1,
    wingLift: -0.5,
    tears: 1,
    blush: 0.55,
    earDroop: 0.9,
  },
  sleepy: {
    ...base,
    mouth: 0,
    mouthOpen: 0.1,
    eyeOpen: 0.22,
    browRaise: 0,
    tuft: 0.3,
    wingLift: -0.3,
    blush: 0.2,
    earDroop: 0.7,
  },
  hot: {
    ...base,
    mouth: -0.1,
    mouthOpen: 0.75,
    eyeOpen: 0.8,
    browAngle: -0.3,
    browRaise: 0.4,
    tuft: 0.5,
    wingLift: 0.65,
    blush: 1,
    earDroop: 0.5,
  },
  jittery: {
    ...base,
    mouth: -0.2,
    mouthOpen: 0.3,
    browAngle: 0.3,
    browRaise: 0.9,
    tuft: 1,
    wingLift: 0.85,
    blush: 0.3,
    earDroop: 0,
  },
  gone: {
    ...base,
    mouth: -0.4,
    eyeOpen: 0,
    browAngle: -0.5,
    browRaise: 0,
    tuft: 0,
    wingLift: -1,
    blush: 0,
    earDroop: 1,
  },
};

export const PARAM_KEYS = Object.keys(base) as (keyof ChickParams)[];

export function mixParams(a: ChickParams, b: ChickParams, t: number): ChickParams {
  const k = Math.max(0, Math.min(1, t));
  const out = { ...a };
  for (const key of PARAM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/** Auf Stufen runden – weniger Neuberechnungen der Aquarell-Filter. */
const q = (v: number, step = 0.05) => Math.round(v / step) * step;

export function quantize(p: ChickParams): ChickParams {
  const out = { ...p };
  for (const key of PARAM_KEYS) out[key] = q(p[key]);
  return out;
}

/** Welche Stimmung ein Bedürfnis ins Gesicht bringt. */
const NEED_MOOD: Partial<Record<Need, Mood>> = {
  heat: 'hot',
  tired: 'sleepy',
  restless: 'jittery',
  hunger: 'worried',
  bored: 'sleepy',
};

/**
 * Zielausdruck aus dem Zustand des Kükens: Befinden setzt die Grundstimmung, spürbare
 * Bedürfnisse färben sie, Schaden bringt Tränen, Lieblingspflege ein Strahlen.
 */
export function chickParamsFor(
  state: ChickState,
  config: GameConfig,
  opts: { hurting?: boolean; liked?: boolean } = {},
): ChickParams {
  if (!state.alive) return MOODS.gone;
  const w = state.wellbeing;
  let p =
    w >= 0.75
      ? MOODS.content
      : w >= 0.45
        ? mixParams(MOODS.worried, MOODS.content, (w - 0.45) / 0.3)
        : mixParams(MOODS.sad, MOODS.worried, w / 0.45);
  for (const kind of config.care.activeKinds) {
    const need = NEED_FOR_CARE[kind];
    const level = state.needs[need];
    const mood = NEED_MOOD[need];
    if (mood && level > 0.4) p = mixParams(p, MOODS[mood], ((level - 0.4) / 0.6) * 0.8);
  }
  if (opts.hurting) p = mixParams(p, MOODS.crying, 0.8);
  else if (opts.liked) p = mixParams(p, MOODS.happy, 0.75);
  return quantize(p);
}

/** Farbstärke je Bedürfnis im Küken (0…1, gestuft). */
export function needTints(state: ChickState, config: GameConfig): Partial<Record<Need, number>> {
  const out: Partial<Record<Need, number>> = {};
  for (const kind of config.care.activeKinds) {
    const need = NEED_FOR_CARE[kind];
    out[need] = q(Math.max(0, Math.min(1, (state.needs[need] - 0.25) / 0.75)), 0.1);
  }
  return out;
}
