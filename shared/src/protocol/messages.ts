import { z } from 'zod';

/**
 * Nachrichten zwischen Handy und Server über WebSocket (JSON).
 *
 * Grundsätze:
 * - Jede Nachricht hat ein `type`-Feld; beide Richtungen sind Zod-Unions.
 * - Zeitpunkte sind Server-Zeit in ms (Epoch). Clients rechnen mit ihrem
 *   gemessenen Uhr-Versatz um.
 * - Der Server schickt jedem Client nur, was dieser sehen darf
 *   (Rollen, Spick-Aufzeichnungen, Stimmen bleiben auf dem Server).
 *
 * Raum-, Spiel- und Admin-Nachrichten kommen in den folgenden Meilensteinen dazu.
 */
export const PROTOCOL_VERSION = 1;

/** Größte erlaubte Nachricht in Bytes. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

const ms = z.number().finite().nonnegative();

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export const HelloSchema = z.object({
  type: z.literal('hello'),
  protocol: z.number().int(),
  /** Token aus einer früheren Verbindung zum Wiederverbinden. */
  sessionToken: z.string().min(16).max(128).optional(),
  /** Gerätebeschreibung für das Debug-Log (z. B. "iPhone Safari 18"). */
  device: z.string().max(200).optional(),
});

export const TimePingSchema = z.object({
  type: z.literal('time.ping'),
  /** Lokale Uhr des Clients beim Senden. */
  clientSentAt: ms,
});

export const ModuleClientMessageSchema = z.object({
  type: z.literal('module.message'),
  moduleId: z.string().max(32),
  payload: z.unknown(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloSchema,
  TimePingSchema,
  ModuleClientMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export const WelcomeSchema = z.object({
  type: z.literal('welcome'),
  protocol: z.number().int(),
  sessionToken: z.string(),
  /** true, wenn eine bestehende Sitzung wieder aufgenommen wurde. */
  resumed: z.boolean(),
  serverTime: ms,
});

export const TimePongSchema = z.object({
  type: z.literal('time.pong'),
  clientSentAt: ms,
  serverReceivedAt: ms,
  serverSentAt: ms,
});

export const ERROR_CODES = [
  'bad_message',
  'protocol_mismatch',
  'not_ready',
  'not_allowed',
  'room_not_found',
  'room_full',
  'internal',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string(),
});

/** Ereignis eines Moduls, optional zu einem gemeinsamen Zeitpunkt ausgelöst. */
export const ModuleServerEventSchema = z.object({
  type: z.literal('module.event'),
  moduleId: z.string(),
  event: z.string(),
  payload: z.unknown().optional(),
  at: ms.optional(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  WelcomeSchema,
  TimePongSchema,
  ErrorMessageSchema,
  ModuleServerEventSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: string | unknown): ParseResult<T> {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: 'Nachricht zu groß' };
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Kein gültiges JSON' };
    }
  }
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, message: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}

export const parseClientMessage = (raw: string | unknown) => parseWith(ClientMessageSchema, raw);
export const parseServerMessage = (raw: string | unknown) => parseWith(ServerMessageSchema, raw);
