import type { GameConfig } from '../config/schema.ts';

/**
 * Abstimmung: Jeder kann vorläufig wählen und ändern; angezeigt wird nur die Anzahl der
 * Stimmen je Kandidat. Beim Auszählen entscheidet die meisten Stimmen; bei Gleichstand
 * Stichwahl unter den Gleichstehenden (bis `maxRunoffs`), danach niemand.
 */
export type VoteOutcome =
  | { kind: 'accused'; playerId: string }
  | { kind: 'runoff'; candidates: string[] }
  | { kind: 'nobody'; reason: 'no_votes' | 'tie' };

export function tallyVotes(
  votes: ReadonlyMap<string, string> | Record<string, string>,
  candidates: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(candidates.map((c) => [c, 0]));
  const entries = votes instanceof Map ? [...votes.values()] : Object.values(votes);
  for (const target of entries) if (target in counts) counts[target] = (counts[target] ?? 0) + 1;
  return counts;
}

export function decideVote(
  counts: Record<string, number>,
  runoffsDone: number,
  config: GameConfig,
): VoteOutcome {
  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) return { kind: 'nobody', reason: 'no_votes' };
  const leaders = Object.keys(counts).filter((id) => counts[id] === max);
  if (leaders.length === 1) return { kind: 'accused', playerId: leaders[0] as string };
  if (config.voting.tieBreak === 'runoff' && runoffsDone < config.voting.maxRunoffs) {
    return { kind: 'runoff', candidates: leaders };
  }
  return { kind: 'nobody', reason: 'tie' };
}
