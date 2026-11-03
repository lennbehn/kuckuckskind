import type { CareKind, GameConfig, Need } from '../config/schema.ts';
import type { Rng } from '../game/rng.ts';
import type { StationStats } from './simulation.ts';

/**
 * Vage Hinweise bei der Heimkehr – regelbasiert aus den Stationsstatistiken.
 * Ohne Namen und ohne Reihenfolge: Die Hinweise werden gemischt, nie „zuerst/zuletzt“.
 */

const CARE_DONE: Record<CareKind, string> = {
  blow: 'jemand hat mich nur angepustet',
  rock: 'ich wurde nur gewiegt',
  cover: 'ich wurde nur zugedeckt',
  feed: 'ich bekam nur Krümel',
  sing: 'mir wurde nur vorgesungen',
};

const NEED_FELT: Record<Need, string> = {
  heat: 'war mir ganz heiß',
  restless: 'war ich ganz zappelig',
  tired: 'war ich so müde',
  hunger: 'hatte ich Hunger',
  bored: 'war mir langweilig',
};

const NEGLECT: Record<Need, string> = {
  heat: 'Eine Weile war mir schrecklich heiß, und niemand hat gepustet.',
  restless: 'Ich war lange ganz unruhig, und keiner hat mich gewiegt.',
  tired: 'Ich war hundemüde, aber niemand hat mich zugedeckt.',
  hunger: 'Ich hatte Hunger, und keiner hat mich gefüttert.',
  bored: 'Mir war furchtbar langweilig, und niemand hat mir etwas vorgesungen.',
};

const OVERCARE: Record<CareKind, string> = {
  blow: 'Jemand hat mich so lange angepustet, dass mir richtig kalt wurde.',
  rock: 'Jemand hat mich ewig gewiegt, obwohl ich längst ruhig war – mir wurde schwindelig.',
  cover: 'Jemand hat mich zugedeckt, obwohl ich gar nicht müde war. Ich bekam kaum Luft.',
  feed: 'Jemand hat mich vollgestopft, obwohl ich satt war.',
  sing: 'Jemand hat ewig gesungen, obwohl ich meine Ruhe wollte.',
};

const LIKED_VERB: Record<CareKind, string> = {
  blow: 'angepustet',
  rock: 'gewiegt',
  cover: 'zugedeckt',
  feed: 'gefüttert',
  sing: 'besungen',
};

const DISLIKED_NOUN: Record<CareKind, string> = {
  blow: 'Pusten',
  rock: 'Gewiegt werden',
  cover: 'Zugedeckt werden',
  feed: 'Gefüttert werden',
  sing: 'Gesang',
};

interface Candidate {
  text: string;
  weight: number;
}

function candidates(
  s: StationStats,
  liked: readonly CareKind[],
  disliked: readonly CareKind[],
): Candidate[] {
  const out: Candidate[] = [];
  if (s.died) {
    out.push({
      text: 'Irgendwann ging es mir so schlecht, dass ich nicht mehr konnte.',
      weight: 100,
    });
  }
  if (s.roughMs > 2000) {
    out.push({
      text: 'Irgendwann wurde ich ganz doll geschüttelt.',
      weight: 12 + s.roughMs / 1000,
    });
  } else if (s.roughMs > 500) {
    out.push({
      text: 'Einmal hat mich jemand ziemlich wild herumgeschaukelt.',
      weight: 8 + s.roughMs / 1000,
    });
  }
  for (const [need, ms] of Object.entries(s.neglectMs) as [Need, number][]) {
    if (ms > 1000) out.push({ text: NEGLECT[need], weight: 9 + ms / 1000 });
  }
  for (const [kind, ms] of Object.entries(s.overcareMs) as [CareKind, number][]) {
    if (ms > 2000) out.push({ text: OVERCARE[kind], weight: 6 + ms / 1000 });
  }
  for (const [key, ms] of Object.entries(s.wrongCareMs)) {
    if (ms < 1500) continue;
    const [need, care] = key.split('>') as [Need, CareKind];
    out.push({
      text: `Einmal ${NEED_FELT[need]}, aber ${CARE_DONE[care]}.`,
      weight: 5 + ms / 1000,
    });
  }
  const reliefTotal = Object.values(s.reliefMs).reduce((a, b) => a + (b ?? 0), 0);
  if (s.loss < 0.01 && reliefTotal > 5000) {
    out.push({ text: 'Bei einer Person habe ich mich richtig geborgen gefühlt.', weight: 4 });
  }
  if (s.likedMs > 3000 && liked[0]) {
    out.push({
      text: `Jemand hat mich genau richtig ${LIKED_VERB[liked[0]]} – das mag ich am liebsten!`,
      weight: 3,
    });
  }
  if (s.dislikedMs > 4000 && disliked[0]) {
    out.push({
      text: `${DISLIKED_NOUN[disliked[0]]} mag ich eigentlich gar nicht … trotzdem hat es jemand lange gemacht.`,
      weight: 2,
    });
  }
  return out;
}

export function generateHints(
  stations: readonly StationStats[],
  character: { likes: readonly CareKind[]; dislikes: readonly CareKind[] },
  config: GameConfig,
  rng: Rng,
): string[] {
  const all = stations.flatMap((s) => candidates(s, character.likes, character.dislikes));
  // Gleiche Sätze zusammenfassen (stärkstes Gewicht zählt), dann die wichtigsten nehmen.
  const best = new Map<string, number>();
  for (const c of all) best.set(c.text, Math.max(best.get(c.text) ?? 0, c.weight + rng.next()));
  const chosen = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, config.hints.perChick)
    .map(([text]) => text);
  if (chosen.length === 0 && config.hints.perChick > 0)
    chosen.push('Eigentlich war alles ganz ruhig.');
  return rng.shuffle(chosen);
}

/** Genaue Beschreibung der Spick-Station (die eine lückenlos aufgezeichnete Station). */
export function describePeek(s: StationStats): string[] {
  const sec = (ms: number) => `${Math.round(ms / 1000)} s`;
  const lines: string[] = [];
  const careName: Record<CareKind, string> = {
    blow: 'gepustet',
    rock: 'sanft gewiegt',
    cover: 'zugedeckt',
    feed: 'gefüttert',
    sing: 'vorgesungen',
  };
  for (const [kind, ms] of Object.entries(s.reliefMs) as [CareKind, number][]) {
    if (ms >= 500) lines.push(`${sec(ms)} richtig ${careName[kind]}`);
  }
  for (const [kind, ms] of Object.entries(s.overcareMs) as [CareKind, number][]) {
    if (ms >= 500) lines.push(`${sec(ms)} ${careName[kind]}, obwohl es nicht nötig war`);
  }
  for (const [key, ms] of Object.entries(s.wrongCareMs)) {
    if (ms < 500) continue;
    const [need, care] = key.split('>') as [Need, CareKind];
    lines.push(`${sec(ms)} ${careName[care]}, obwohl ${NEED_NOUN[need]} dringender war`);
  }
  if (s.roughMs >= 300) lines.push(`${sec(s.roughMs)} zu wild geschüttelt`);
  for (const [need, ms] of Object.entries(s.neglectMs) as [Need, number][]) {
    if (ms >= 500) lines.push(`${sec(ms)} vernachlässigt (${NEED_FOR_CARE_LABEL[need]} fehlte)`);
  }
  const delta = s.wellbeingEnd - s.wellbeingStart;
  lines.push(
    delta > 0.02
      ? 'Danach ging es mir besser als vorher.'
      : delta < -0.02
        ? `Danach ging es mir schlechter (−${Math.round(-delta * 100)} %).`
        : 'Danach ging es mir ungefähr wie vorher.',
  );
  if (s.died) lines.push('Dort ging es mir so schlecht, dass ich nicht mehr konnte.');
  return lines;
}

const NEED_NOUN: Record<Need, string> = {
  heat: 'Hitze',
  restless: 'Unruhe',
  tired: 'Müdigkeit',
  hunger: 'Hunger',
  bored: 'Langeweile',
};

const NEED_FOR_CARE_LABEL: Record<Need, string> = {
  heat: 'Pusten',
  restless: 'Wiegen',
  tired: 'Zudecken',
  hunger: 'Füttern',
  bored: 'Vorsingen',
};
