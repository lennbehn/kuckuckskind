import { z } from 'zod';
import {
  CareKindSchema,
  CareMethodSchema,
  CharacterSchema,
  ChickReportSchema,
  DeviceCalibrationSchema,
  GameResultSchema,
  HostSettingsSchema,
  RoleSchema,
  RoomPhaseSchema,
  StationStatsSchema,
  TimelineSchema,
} from '@kuckuckskind/shared';

/** Bei inkompatiblen Änderungen erhöhen; ältere Snapshots werden dann verworfen. */
export const SNAPSHOT_VERSION = 3;

/** Zustand einer laufenden Partie (ab dem Schlüpfen). Enthält Geheimes – verlässt den Server nie. */
export const MatchStateSchema = z.object({
  seed: z.number().int(),
  hatch: z.object({ at: z.number(), revealEndsAt: z.number() }),
  roles: z.record(z.string(), RoleSchema),
  characters: z.record(z.string(), CharacterSchema),
  /** Seed je Küken (Startwerte, Hinweise). */
  chickSeeds: z.record(z.string(), z.number().int()),
  peekDeadline: z.number(),
  /** Eigentümer → Mitspieler, bei dem das Küken genau hinschaut. */
  peekChoices: z.record(z.string(), z.string()),
  timeline: TimelineSchema.nullable(),
  finishedAt: z.number().nullable(),
  /** Letzter gemeldeter Stand je Küken. */
  reports: z.record(z.string(), ChickReportSchema),
  /** Stationsstatistik je Küken und Runde (Aufzeichnung nur für die Spick-Station). */
  stations: z.record(z.string(), z.record(z.string(), StationStatsSchema)),
  votes: z.record(z.string(), z.string()),
  voting: z.object({ candidates: z.array(z.string()), runoff: z.number().int() }).nullable(),
  reveal: z
    .object({
      at: z.number(),
      accusedId: z.string().nullable(),
      accusedRole: RoleSchema.nullable(),
      reason: z.enum(['no_votes', 'tie', 'no_cuckoo']).nullable(),
    })
    .nullable(),
  result: GameResultSchema.nullable(),
  /** Eule (Pflegeelternteil) und wen sie beobachtet – geheim. */
  owlId: z.string().nullable().default(null),
  owlChoice: z.string().nullable().default(null),
  /** Falkenblicke je Person (verdient durch sehr gute Pflege). */
  glances: z.record(z.string(), z.number().int().nonnegative()).default({}),
  /** Insgesamt verdiente Falkenblicke je Person (Obergrenze je Partie). */
  glancesEarned: z.record(z.string(), z.number().int().nonnegative()).default({}),
  /** Je Küken die Runden, nach denen eine graue Kuckucksfeder gefallen ist. */
  feathers: z.record(z.string(), z.array(z.number().int())).default({}),
});
export type MatchState = z.infer<typeof MatchStateSchema>;

/** Speicherbarer Zustand eines Raums (DynamoDB). Sitzungs-Tokens nur als Hash. */
export const RoomSnapshotSchema = z.object({
  v: z.literal(SNAPSHOT_VERSION),
  code: z.string(),
  createdAt: z.number(),
  phase: RoomPhaseSchema,
  hostId: z.string(),
  players: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tokenHash: z.string(),
      joinedAt: z.number(),
      lastSeenAt: z.number(),
    }),
  ),
  seating: z.array(z.string()),
  presetOverride: z.record(z.string(), z.unknown()),
  settings: HostSettingsSchema,
  hatched: z.record(z.string(), z.partialRecord(CareKindSchema, CareMethodSchema)),
  calibrations: z.record(z.string(), DeviceCalibrationSchema),
  match: MatchStateSchema.nullable(),
  presetRef: z
    .object({
      presetId: z.string().nullable(),
      name: z.string(),
      version: z.number().int().nullable(),
    })
    .nullable()
    .default(null),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
