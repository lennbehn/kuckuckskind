import { z } from 'zod';
import { HostSettingsSchema, RoomPhaseSchema, TimelineSchema } from '@kuckuckskind/shared';

export const SNAPSHOT_VERSION = 1;

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
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
