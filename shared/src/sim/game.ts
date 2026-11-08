import type { GameConfig } from '../config/schema.ts';
import { rollCharacter, type Character } from '../chick/character.ts';
import {
  NO_CARE,
  emptyStats,
  initialChick,
  startStation,
  stepChick,
  type ChickState,
  type StationStats,
} from '../chick/simulation.ts';
import { assignRoles } from '../game/roles.ts';
import type { Role } from '../game/phase.ts';
import { createRng, type Rng } from '../game/rng.ts';
import { holderOf, totalRounds } from '../game/seating.ts';
import { cuckooBot, fosterBot, GOOD_FOSTER, SNEAKY_CUCKOO, type BotPolicy } from './bots.ts';

export interface SimulatedGame {
  seating: string[];
  roles: Record<string, Role>;
  characters: Record<string, Character>;
  chicks: Record<string, ChickState>;
  /** stats[owner][round] */
  stats: Record<string, StationStats[]>;
}

export interface SimulateOptions {
  players: number;
  seed: number;
  stepMs?: number;
  /** Bot für einen Halter in einer Station (Standard: gute Pflegeeltern, leiser Kuckuck). */
  botFor?: (holder: string, owner: string, role: Role, rng: Rng) => BotPolicy;
}

const defaultBot = (holder: string, owner: string, role: Role, rng: Rng): BotPolicy =>
  role === 'cuckoo' && holder !== owner ? cuckooBot(SNEAKY_CUCKOO, rng) : fosterBot(GOOD_FOSTER);

/** Ganze Partie ohne Netz: Rollen, Charaktere, alle Stationen. */
export function simulateGame(config: GameConfig, opts: SimulateOptions): SimulatedGame {
  const rng = createRng(opts.seed);
  const stepMs = opts.stepMs ?? 100;
  const seating = Array.from({ length: opts.players }, (_, i) => `p${i}`);
  const roles = assignRoles(seating, config, rng);
  const characters = Object.fromEntries(seating.map((id) => [id, rollCharacter(config, rng)]));
  const chicks: Record<string, ChickState> = Object.fromEntries(
    seating.map((id) => [id, initialChick(config, rng)]),
  );
  const stats: Record<string, StationStats[]> = Object.fromEntries(seating.map((id) => [id, []]));
  const stationMs = config.timing.stationSeconds * 1000;
  const botFor = opts.botFor ?? defaultBot;

  for (let round = 0; round < totalRounds(config, seating.length); round++) {
    for (const owner of seating) {
      const holder = holderOf(owner, round, seating);
      const bot = botFor(holder, owner, roles[holder] as Role, rng);
      const st = emptyStats(round, (chicks[owner] as ChickState).wellbeing);
      let chick = startStation(chicks[owner] as ChickState);
      const env = { config, character: characters[owner] as Character };
      for (let t = 0; t < stationMs; t += stepMs) {
        const input = chick.alive ? bot({ state: chick, config, t, rng }) : NO_CARE;
        chick = stepChick(chick, input, stepMs, env, st);
      }
      chicks[owner] = chick;
      (stats[owner] as StationStats[]).push(st);
    }
  }
  return { seating, roles, characters, chicks, stats };
}
