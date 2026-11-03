import { z } from 'zod';
import { CareKindSchema, type CareKind, type GameConfig } from '../config/schema.ts';
import type { Rng } from '../game/rng.ts';

/** Charakter eines Kükens: welche Pflege es besonders mag bzw. nicht mag. */
export const CharacterSchema = z.object({
  likes: z.array(CareKindSchema),
  dislikes: z.array(CareKindSchema),
});
export type Character = z.infer<typeof CharacterSchema>;

/** Zufälliger Charakter aus den aktiven Pflegearten; mag und mag-nicht überschneiden sich nie. */
export function rollCharacter(config: GameConfig, rng: Rng): Character {
  const kinds = rng.shuffle(config.care.activeKinds);
  const likes = kinds.slice(0, Math.min(config.character.likesPerChick, kinds.length));
  const rest = kinds.slice(likes.length);
  const dislikes = rest.slice(0, Math.min(config.character.dislikesPerChick, rest.length));
  return { likes, dislikes };
}

export function careFactor(kind: CareKind, character: Character, config: GameConfig): number {
  if (character.likes.includes(kind)) return config.character.likedReliefFactor;
  if (character.dislikes.includes(kind)) return config.character.dislikedReliefFactor;
  return 1;
}
