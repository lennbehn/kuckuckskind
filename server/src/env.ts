import { z } from 'zod';

/** Laufzeit-Einstellungen des Servers aus Umgebungsvariablen (vom CDK-Stack gesetzt). */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  STAGE: z.enum(['local', 'dev', 'prod']).default('local'),
  /** Kommagetrennte Liste erlaubter Origins für WebSocket; leer = alle (nur lokal sinnvoll). */
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  ROOMS_TABLE: z.string().optional(),
  PRESETS_TABLE: z.string().optional(),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
