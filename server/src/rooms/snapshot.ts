import { z } from 'zod';
import {
  CareKindSchema,
  CareMethodSchema,
  DeviceCalibrationSchema,
  HostSettingsSchema,
  RoleSchema,
  RoomPhaseSchema,
  TimelineSchema,
} from '@kuckuckskind/shared';

/** Bei inkompatiblen Änderungen erhöhen; ältere Snapshots werden dann verworfen. */
export const SNAPSHOT_VERSION = 2;

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
  timeline: TimelineSchema.nullable(),
  finishedAt: z.number().nullable(),
  hatched: z.record(z.string(), z.partialRecord(CareKindSchema, CareMethodSchema)),
  calibrations: z.record(z.string(), DeviceCalibrationSchema),
  hatch: z.object({ at: z.number(), revealEndsAt: z.number() }).nullable(),
  /** Geheim – verlässt den Server nie. */
  roles: z.record(z.string(), RoleSchema).nullable(),
  seed: z.number().int().nullable(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
