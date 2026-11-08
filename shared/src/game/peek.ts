import { holderOf } from './seating.ts';

/**
 * Spick-Station: Jeder Eigentümer wählt geheim einen Mitspieler, bei dem sein Küken „genau
 * hinschaut“. Wählbar ist nur, wer das Küken in einer der gespielten Runden auch hält.
 */
export function peekOptions(
  ownerId: string,
  seating: readonly string[],
  rounds: number,
  allowSelf: boolean,
): string[] {
  const holders = new Set<string>();
  for (let r = 0; r < rounds; r++) holders.add(holderOf(ownerId, r, seating));
  if (!allowSelf) holders.delete(ownerId);
  return seating.filter((id) => holders.has(id));
}

/** Runde, in der `targetId` das Küken von `ownerId` hält (erste passende), sonst null. */
export function peekRound(
  ownerId: string,
  targetId: string,
  seating: readonly string[],
  rounds: number,
): number | null {
  for (let r = 0; r < rounds; r++) if (holderOf(ownerId, r, seating) === targetId) return r;
  return null;
}
