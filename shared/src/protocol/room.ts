import { z } from 'zod';
import { CareKindSchema, GameConfigSchema, ModuleIdSchema } from '../config/schema.ts';
import type { ConfigOverride } from '../config/resolve.ts';
import { RoleSchema } from '../game/phase.ts';
import { ChickOutcomeSchema, GameResultSchema } from '../game/scoring.ts';
import { CharacterSchema } from '../chick/character.ts';
import { StationStatsSchema } from '../chick/simulation.ts';
import { NeedSchema } from '../config/schema.ts';

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

/**
 * Phasen des Raums:
 *   lobby → hatching → peekChoice → rounds → homecoming → voting → reveal
 * `peekChoice` beginnt mit dem gemeinsamen Schlüpfen und der geheimen Rollen-Einblendung
 * (bis `hatch.revealEndsAt`), danach wählt jeder seine Spick-Station.
 * `reveal` enthält Enthüllung und Wertung.
 */
export const RoomPhaseSchema = z.enum([
  'lobby',
  'hatching',
  'peekChoice',
  'rounds',
  'homecoming',
  'voting',
  'reveal',
]);
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

/** Ergebnis des Technik-Checks eines Geräts (für Hinweise und Live-Debug im Admin). */
export const SensorStatusSchema = z.enum([
  'ok',
  'denied',
  'unavailable',
  'insecure',
  'error',
  'unused',
]);
export type SensorStatus = z.infer<typeof SensorStatusSchema>;

export const DeviceCalibrationSchema = z.object({
  platform: z.enum(['ios', 'android', 'other']),
  standalone: z.boolean(),
  wakeLock: z.boolean(),
  mic: z.object({
    status: SensorStatusSchema,
    noiseDb: z.number().optional(),
    peakDb: z.number().optional(),
  }),
  motion: z.object({
    status: SensorStatusSchema,
    scale: z.number().optional(),
  }),
  cover: z.object({
    minTouchPoints: z.number().int().optional(),
    maxTouches: z.number().int().optional(),
    method: z.enum(['touches', 'area', 'fallback']).optional(),
  }),
});
export type DeviceCalibration = z.infer<typeof DeviceCalibrationSchema>;

export const CareMethodSchema = z.enum(['sensor', 'fallback']);
export type CareMethod = z.infer<typeof CareMethodSchema>;

export const PlayerViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  connected: z.boolean(),
  /** Beim Ausbrüten erledigte Pflegearten (für „Warte auf …“). */
  hatched: z.array(CareKindSchema),
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
  /** Gemeinsames Schlüpfen: Zeitpunkte (Server-Zeit), sobald alle Eier fertig sind. */
  hatch: z
    .object({
      at: z.number(),
      /** Ende der Rollen-Einblendung. */
      revealEndsAt: z.number(),
    })
    .nullable(),
  /** Spick-Wahl läuft: Frist und wie viele schon gewählt haben (nicht wer wen). */
  peek: z.object({ deadline: z.number(), chosenCount: z.number().int() }).nullable(),
  /** Zustand aller Küken – ab der Heimkehr öffentlich. */
  chicks: z.record(z.string(), ChickOutcomeSchema).nullable(),
  /** Abstimmung: nur Anzahl der Stimmen je Kandidat. */
  voting: z
    .object({
      candidates: z.array(z.string()),
      counts: z.record(z.string(), z.number().int()),
      votedCount: z.number().int(),
      /** 0 = erste Abstimmung, 1 = erste Stichwahl … */
      runoff: z.number().int(),
    })
    .nullable(),
  /** Enthüllung: zum Zeitpunkt `at` dreht sich überall das Küken des Beschuldigten um. */
  reveal: z
    .object({
      at: z.number(),
      accusedId: z.string().nullable(),
      accusedRole: RoleSchema.nullable(),
      /** Warum niemand beschuldigt wurde. */
      reason: z.enum(['no_votes', 'tie', 'no_cuckoo']).nullable(),
    })
    .nullable(),
  /** Wertung mit allen Rollen – erst in der Phase `reveal`. */
  result: GameResultSchema.nullable(),
  you: z.object({
    playerId: z.string(),
    /** Eigene Rolle – nur bis zum Ende der Einblendung, danach nie wieder. */
    role: RoleSchema.optional(),
    /** Spick-Wahl: wählbare Mitspieler und eigene Wahl (geheim). */
    peekOptions: z.array(z.string()).optional(),
    peekChoice: z.string().nullable().optional(),
    /** Eigenes Küken: Charakter, schon gemeldete Runden, letzter Stand (zum Fortsetzen). */
    chick: z
      .object({
        character: CharacterSchema,
        seed: z.number().int(),
        reportedRounds: z.array(z.number().int()),
        last: z.lazy(() => ChickReportSchema).nullable(),
      })
      .optional(),
    /** Heimkehr: vage Hinweise und die Spick-Aufzeichnung des eigenen Kükens. */
    story: z
      .object({
        hints: z.array(z.string()),
        peek: z.object({ targetId: z.string(), stats: StationStatsSchema }).nullable(),
      })
      .optional(),
    /** Eigene Stimme (geheim). */
    vote: z.string().nullable().optional(),
  }),
});
export type RoomView = z.infer<typeof RoomViewSchema>;

/**
 * Host-Steuerung. `hatchNow`: alle sofort schlüpfen lassen; `peekNow`: Spick-Wahl beenden
 * (Rest zufällig); `startVoting`/`closeVoting`: Abstimmung öffnen bzw. auszählen.
 */
export const GameControlSchema = z.enum([
  'pause',
  'resume',
  'skip',
  'abort',
  'hatchNow',
  'peekNow',
  'startVoting',
  'closeVoting',
]);

const needRecord = z.record(NeedSchema, z.number());

/** Laufender Stand eines Kükens, gemeldet vom Handy des Eigentümers. */
export const ChickReportSchema = z.object({
  /** Server-Zeit der Messung. */
  at: z.number(),
  round: z.number().int().nullable(),
  needs: needRecord,
  urgentMs: needRecord,
  wellbeing: z.number().min(0).max(1),
  alive: z.boolean(),
  stationLoss: z.number().nonnegative(),
});
export type ChickReport = z.infer<typeof ChickReportSchema>;
export type GameControl = z.infer<typeof GameControlSchema>;
