import { z } from 'zod';

/** Phasen einer Partie, in dieser Reihenfolge. */
export const PHASES = [
  'lobby',
  'hatching',
  'roleReveal',
  'peekChoice',
  'rounds',
  'homecoming',
  'voting',
  'reveal',
  'scoring',
] as const;
export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

export const RoleSchema = z.enum(['foster', 'cuckoo']);
export type Role = z.infer<typeof RoleSchema>;
