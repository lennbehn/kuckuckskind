import type { GameConfig } from '../config/schema.ts';
import type { StationStats } from '../chick/simulation.ts';
import type { Role } from '../game/phase.ts';
import type { Rng } from '../game/rng.ts';
import { holderOf } from '../game/seating.ts';

/**
 * Hinweis-Module, die helfen, den Kuckuck zu finden – reine Funktionen, vom Raum-Automaten
 * auf dem Server aufgerufen:
 *
 * - Falkenblick: Wer eine Station sehr gut pflegt, verdient einen Blick auf das, was das
 *   Küken in den Händen eines Mitspielers gerade braucht.
 * - Kuckucksfedern: Sabotiert der Kuckuck eine Station stark, fällt manchmal eine graue Feder
 *   ins Nest; die nächste Person sieht sie.
 * - Eule: Ein Pflegeelternteil beobachtet heimlich einen Mitspieler und erfährt, ob dieser
 *   den Küken viel, mittel oder wenig geschadet hat (nicht die Rolle).
 */

/** Fehlpflege einer Station in ms: übertrieben, falsch oder zu wild. */
export function mistakeMs(s: StationStats): number {
  const sum = (r: Partial<Record<string, number>>) =>
    Object.values(r).reduce<number>((a, b) => a + (b ?? 0), 0);
  return sum(s.overcareMs) + sum(s.wrongCareMs) + s.roughMs;
}

const reliefMs = (s: StationStats) =>
  Object.values(s.reliefMs).reduce<number>((a, b) => a + (b ?? 0), 0);

// ---------------------------------------------------------------------------
// Falkenblick
// ---------------------------------------------------------------------------

/** Hat der Halter diese Station so gut gepflegt, dass er einen Falkenblick verdient? */
export function earnsFalcon(s: StationStats, config: GameConfig): boolean {
  const c = config.modules.falcon;
  if (!c.enabled || s.died) return false;
  return (
    s.loss <= c.maxLoss &&
    mistakeMs(s) <= c.maxMistakeSeconds * 1000 &&
    reliefMs(s) >= c.minCareSeconds * 1000
  );
}

// ---------------------------------------------------------------------------
// Kuckucksfedern
// ---------------------------------------------------------------------------

/** Fällt nach dieser Station eine graue Feder ins Nest? Nur bei starkem Schaden, nach Rolle. */
export function featherFalls(
  s: StationStats,
  holderRole: Role,
  config: GameConfig,
  rng: Rng,
): boolean {
  const c = config.modules.feathers;
  if (!c.enabled || s.loss < c.minLoss) return false;
  const chance = holderRole === 'cuckoo' ? c.cuckooChance : c.fosterChance;
  return rng.next() < chance;
}

// ---------------------------------------------------------------------------
// Eule
// ---------------------------------------------------------------------------

/** Wer wird Eule? Ein zufälliges Pflegeelternteil – nur mit Kuckuck und genug Spielern. */
export function pickOwl(roles: Record<string, Role>, config: GameConfig, rng: Rng): string | null {
  const ids = Object.keys(roles);
  const fosters = ids.filter((id) => roles[id] === 'foster');
  if (!config.modules.owl.enabled || ids.length < config.modules.owl.minPlayers) return null;
  if (fosters.length === ids.length) return null; // ohne Kuckuck (Familienmodus) keine Eule
  return fosters.length ? rng.pick(fosters) : null;
}

/** Schaden je Halter über alle Stationen (fremde Küken; das eigene zählt nicht). */
export function harmByHolder(
  stations: Record<string, Record<string, StationStats>>,
  seating: readonly string[],
): Record<string, { loss: number; mistakeMs: number; stations: number }> {
  const out: Record<string, { loss: number; mistakeMs: number; stations: number }> =
    Object.fromEntries(seating.map((id) => [id, { loss: 0, mistakeMs: 0, stations: 0 }]));
  for (const [owner, byRound] of Object.entries(stations)) {
    if (!seating.includes(owner)) continue;
    for (const s of Object.values(byRound)) {
      const holder = holderOf(owner, s.round, seating);
      if (holder === owner) continue;
      const h = out[holder];
      if (!h) continue;
      h.loss += s.loss;
      h.mistakeMs += mistakeMs(s);
      h.stations += 1;
    }
  }
  return out;
}

export type OwlLevel = 'high' | 'medium' | 'low';

/**
 * Urteil der Eule über einen Mitspieler: Rang seines Schadens unter allen Mitspielern
 * (ohne die Eule selbst). Oberes Drittel = viel, unteres = wenig. Ehrlich, aber unscharf.
 */
export function owlVerdict(
  targetId: string,
  owlId: string,
  harm: Record<string, { loss: number; mistakeMs: number; stations: number }>,
): OwlLevel {
  const score = (id: string) => {
    const h = harm[id];
    if (!h || h.stations === 0) return 0;
    // Verlust zählt am meisten; Fehlpflege als Feinunterscheidung (1 Minute ≈ 0,05).
    return (h.loss + (h.mistakeMs / 60_000) * 0.05) / h.stations;
  };
  const others = Object.keys(harm).filter((id) => id !== owlId);
  const ranked = [...others].sort((a, b) => score(b) - score(a));
  const rank = ranked.indexOf(targetId);
  if (rank < 0) return 'medium';
  // Oben und unten gleich viele (mindestens einer), der Rest ist „mittel“.
  const k = Math.max(1, Math.floor(others.length / 3));
  if (rank < k) return 'high';
  if (rank >= others.length - k) return 'low';
  return 'medium';
}

export const OWL_TEXT: Record<OwlLevel, string> = {
  high: 'hat den Küken mehr geschadet als die meisten',
  medium: 'hat den Küken etwa so viel geschadet wie die anderen',
  low: 'hat den Küken weniger geschadet als die meisten',
};
