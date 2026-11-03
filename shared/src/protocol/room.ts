import { z } from 'zod';
import { CareKindSchema, GameConfigSchema, ModuleIdSchema } from '../config/schema.ts';
import type { ConfigOverride } from '../config/resolve.ts';

/** Raumcodes: 4 Konsonanten ohne verwechselbare Zeichen – leicht vorzulesen, keine Wörter. */
export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const RoomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)));

export const PlayerNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Name fehlt').max(20, 'Name zu lang (höchstens 20 Zeichen)'));

/** Phasen, die der Raum in M2 kennt; M3/M4 ergänzen Ausbrüten, Spick-Wahl, Abstimmung usw. */
export const RoomPhaseSchema = z.enum(['lobby', 'rounds', 'homecoming']);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

/**
 * Was der Host in der Lobby einstellen darf. Alles andere kommt aus Preset/Admin.
 * Wird zu einem ConfigOverride übersetzt und mit der Konfiguration geprüft.
 */
export const HostSettingsSchema = z.object({
  stationSeconds: z.number().optional(),
  rounds: z.number().int().nullable().optional(),
  activeKinds: z.array(CareKindSchema).optional(),
  modules: z.partialRecord(ModuleIdSchema, z.boolean()).optional(),
});
export type HostSettings = z.infer<typeof HostSettingsSchema>;

export function hostSettingsToOverride(s: HostSettings): ConfigOverride {
  const modules: Record<string, { enabled: boolean }> = {};
  for (const [id, enabled] of Object.entries(s.modules ?? {})) {
    if (enabled !== undefined) modules[id] = { enabled };
  }
  return {
    ...(s.stationSeconds !== undefined && { timing: { stationSeconds: s.stationSeconds } }),
    ...(s.rounds !== undefined && { room: { rounds: s.rounds } }),
    ...(s.activeKinds !== undefined && { care: { activeKinds: s.activeKinds } }),
    ...(Object.keys(modules).length > 0 && { modules }),
  } as ConfigOverride;
}

export const TimelineSchema = z.object({
  t0: z.number(),
  stationMs: z.number().positive(),
  handoverMs: z.number().nonnegative(),
  rounds: z.number().int().positive(),
  pausedAt: z.number().nullable(),
});

export const PlayerViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  connected: z.boolean(),
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

/**
 * Raumansicht für genau einen Spieler. Enthält nie geheime Daten anderer
 * (Rollen, Spick-Wahl, Stimmen) – die kommen später als eigene Felder nur für `you`.
 */
export const RoomViewSchema = z.object({
  code: z.string(),
  phase: RoomPhaseSchema,
  hostId: z.string(),
  /** Spieler in Sitzordnung (im Uhrzeigersinn). */
  players: z.array(PlayerViewSchema),
  config: GameConfigSchema,
  settings: HostSettingsSchema,
  /** Module, die auf dem Server gebaut sind und eingeschaltet werden können. */
  availableModules: z.array(ModuleIdSchema),
  timeline: TimelineSchema.nullable(),
  you: z.object({ playerId: z.string() }),
});
export type RoomView = z.infer<typeof RoomViewSchema>;

export const GameControlSchema = z.enum(['pause', 'resume', 'skip', 'abort']);
export type GameControl = z.infer<typeof GameControlSchema>;
