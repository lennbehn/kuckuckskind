import { z } from 'zod';
import { CareKindSchema, GameConfigSchema } from '../config/schema.ts';
import { ConfigOverrideSchema } from '../config/resolve.ts';
import { RoleSchema } from '../game/phase.ts';
import { GameResultSchema } from '../game/scoring.ts';
import {
  ChickReportSchema,
  DeviceCalibrationSchema,
  RoomPhaseSchema,
  TimelineSchema,
} from '../protocol/room.ts';

/**
 * Admin-Schnittstelle (HTTP, JSON) für die Testphase.
 *
 *   GET    /api/presets                       öffentlich: Preset-Namen für die Lobby
 *   GET    /api/admin/me                      Anmeldung prüfen
 *   GET    /api/admin/presets                 neueste Version je Preset
 *   GET    /api/admin/presets/:id             alle Versionen eines Presets
 *   POST   /api/admin/presets                 neue Version speichern (PresetInput)
 *   GET    /api/admin/rooms                   laufende Räume
 *   GET    /api/admin/rooms/:code             Live-Debug eines Raums
 *   POST   /api/admin/rooms/:code/config      Preset oder eigene Werte anwenden (nur Lobby)
 *
 * Anmeldung: Cognito-ID-Token (Gruppe „admin“) im Header `x-admin-token`
 * (eigener Header, weil CloudFront `Authorization` nicht ohne Weiteres weiterreicht).
 */
export const ADMIN_TOKEN_HEADER = 'x-admin-token';

export const PresetIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche');

export const PresetInputSchema = z.object({
  /** Fehlt sie, wird sie aus dem Namen gebildet. Gleiche ID = neue Version. */
  presetId: PresetIdSchema.optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(''),
  override: ConfigOverrideSchema,
});
export type PresetInput = z.infer<typeof PresetInputSchema>;

export const PresetSummarySchema = z.object({
  presetId: z.string(),
  version: z.number().int(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  createdBy: z.string().optional(),
});
export type PresetSummary = z.infer<typeof PresetSummarySchema>;

/** Was auf einen Raum angewendet werden soll. */
export const RoomConfigInputSchema = z.union([
  z.object({
    kind: z.literal('preset'),
    presetId: z.string(),
    version: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('custom'),
    override: ConfigOverrideSchema,
    label: z.string().max(100).optional(),
  }),
  z.object({ kind: z.literal('default') }),
]);
export type RoomConfigInput = z.infer<typeof RoomConfigInputSchema>;

/** Herkunft der Raum-Konfiguration (auch für Spieler sichtbar). */
export const RoomPresetRefSchema = z.object({
  presetId: z.string().nullable(),
  name: z.string(),
  version: z.number().int().nullable(),
});
export type RoomPresetRef = z.infer<typeof RoomPresetRefSchema>;

export const RoomSummarySchema = z.object({
  code: z.string(),
  phase: RoomPhaseSchema,
  players: z.number().int(),
  connected: z.number().int(),
  createdAt: z.number(),
  preset: RoomPresetRefSchema.nullable(),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

/** Laufende Messwerte eines Geräts (nur während ein Admin zuschaut). */
export const DeviceLevelsSchema = z.object({
  at: z.number(),
  micDb: z.number().nullable(),
  motion: z.number().nullable(),
  touches: z.number().int().nonnegative(),
  care: z.array(CareKindSchema),
  rough: z.boolean(),
  visible: z.boolean(),
});
export type DeviceLevels = z.infer<typeof DeviceLevelsSchema>;

export const LogEntrySchema = z.object({
  at: z.number(),
  type: z.string(),
  text: z.string(),
  playerId: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const RoomDebugSchema = z.object({
  serverTime: z.number(),
  code: z.string(),
  phase: RoomPhaseSchema,
  hostId: z.string(),
  preset: RoomPresetRefSchema.nullable(),
  config: GameConfigSchema,
  timeline: TimelineSchema.nullable(),
  players: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      connected: z.boolean(),
      lastSeenAt: z.number(),
      hatched: z.array(CareKindSchema),
      role: RoleSchema.nullable(),
      peekChoice: z.string().nullable(),
      vote: z.string().nullable(),
      calibration: DeviceCalibrationSchema.nullable(),
      levels: DeviceLevelsSchema.nullable(),
      chick: ChickReportSchema.nullable(),
      stations: z.array(
        z.object({
          round: z.number().int(),
          loss: z.number(),
          wellbeingEnd: z.number(),
          died: z.boolean(),
        }),
      ),
    }),
  ),
  result: GameResultSchema.nullable(),
  log: z.array(LogEntrySchema),
});
export type RoomDebug = z.infer<typeof RoomDebugSchema>;
