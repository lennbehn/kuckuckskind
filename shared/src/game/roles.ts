import type { GameConfig } from '../config/schema.ts';
import type { Role } from './phase.ts';
import type { Rng } from './rng.ts';

/** Zahl der Kuckucke: im Familienmodus keiner, nie so viele, dass keine Pflegeeltern bleiben. */
export function cuckooCountFor(config: GameConfig, playerCount: number): number {
  if (config.modules.family.enabled) return 0;
  return Math.max(0, Math.min(config.room.cuckooCount, playerCount - 1));
}

/** Rollen zufällig verteilen (nur auf dem Server!). */
export function assignRoles(
  playerIds: readonly string[],
  config: GameConfig,
  rng: Rng,
): Record<string, Role> {
  const cuckoos = new Set(
    rng.shuffle(playerIds).slice(0, cuckooCountFor(config, playerIds.length)),
  );
  return Object.fromEntries(playerIds.map((id) => [id, cuckoos.has(id) ? 'cuckoo' : 'foster']));
}
