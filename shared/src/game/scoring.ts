import { z } from 'zod';
import type { GameConfig } from '../config/schema.ts';
import { RoleSchema, type Role } from './phase.ts';

export const ChickOutcomeSchema = z.object({ wellbeing: z.number(), alive: z.boolean() });
export type ChickOutcome = z.infer<typeof ChickOutcomeSchema>;

export const WinnerSchema = z.enum(['fosters', 'cuckoo', 'none']);
export type Winner = z.infer<typeof WinnerSchema>;

export const GameResultSchema = z.object({
  winner: WinnerSchema,
  accusedId: z.string().nullable(),
  cuckooCaught: z.boolean(),
  allSurvived: z.boolean(),
  /** Nur Kuckucks-Küken sind glücklich (mindestens eins). */
  onlyCuckooHappy: z.boolean(),
  happy: z.array(z.string()),
  roles: z.record(z.string(), RoleSchema),
  chicks: z.record(z.string(), ChickOutcomeSchema),
});
export type GameResult = z.infer<typeof GameResultSchema>;

/**
 * Wertung (CLAUDE.md):
 * - Pflegeeltern gewinnen, wenn alle Küken überleben und ein Kuckuck enttarnt ist.
 * - Der Kuckuck gewinnt, wenn er unentdeckt bleibt oder nur Kuckucks-Küken glücklich sind.
 * - Trifft beides nicht zu (enttarnt, aber ein Küken ist gestorben): niemand gewinnt.
 * - Ohne Kuckuck (Familienmodus): gemeinsam gewonnen, wenn alle überleben.
 * Erfüllen beide Seiten ihre Bedingung, gewinnt der Kuckuck (die speziellere Bedingung).
 */
export function scoreGame(input: {
  roles: Record<string, Role>;
  chicks: Record<string, ChickOutcome>;
  accusedId: string | null;
  config: GameConfig;
}): GameResult {
  const { roles, chicks, accusedId, config } = input;
  const ids = Object.keys(roles);
  const cuckoos = ids.filter((id) => roles[id] === 'cuckoo');
  const alive = (id: string) => chicks[id]?.alive ?? true;
  const allSurvived = ids.every(alive);
  const happy = ids.filter(
    (id) => alive(id) && (chicks[id]?.wellbeing ?? 0) >= config.scoring.happyMin,
  );
  const onlyCuckooHappy =
    cuckoos.length > 0 && happy.length > 0 && happy.every((id) => roles[id] === 'cuckoo');
  const cuckooCaught = accusedId !== null && roles[accusedId] === 'cuckoo';

  let winner: Winner;
  if (cuckoos.length === 0) winner = allSurvived ? 'fosters' : 'none';
  else if (!cuckooCaught || onlyCuckooHappy) winner = 'cuckoo';
  else winner = allSurvived ? 'fosters' : 'none';

  return { winner, accusedId, cuckooCaught, allSurvived, onlyCuckooHappy, happy, roles, chicks };
}
