import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION, GameConfigSchema, type GameConfig } from './schema.ts';

/** Teilweise Konfiguration: nur die Werte, die vom Standard abweichen. Arrays werden ersetzt. */
export type ConfigOverride = DeepPartial<GameConfig>;

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Lockeres Schema für Overrides aus dem Netz/der Datenbank; die Prüfung passiert in `resolveConfig`. */
export const ConfigOverrideSchema = z.record(z.string(), z.unknown());

/** Alle Standardwerte. */
export const defaultGameConfig: GameConfig = Object.freeze(GameConfigSchema.parse({}));

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tiefes Zusammenführen; spätere Quellen gewinnen, Arrays werden ersetzt, `undefined` ignoriert. */
export function deepMerge(...sources: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    for (const [key, value] of Object.entries(src)) {
      if (value === undefined) continue;
      const prev = out[key];
      out[key] = isPlainObject(value)
        ? deepMerge(isPlainObject(prev) ? prev : {}, value)
        : Array.isArray(value)
          ? [...value]
          : value;
    }
  }
  return out;
}

/**
 * Löst Standardwerte + Overrides (z. B. Preset, dann Raum-Einstellungen) zu einer
 * vollständigen, geprüften Konfiguration auf. Wirft bei ungültigen Werten.
 */
export function resolveConfig(...overrides: (ConfigOverride | undefined)[]): GameConfig {
  return GameConfigSchema.parse(deepMerge({}, ...overrides));
}

/** Wie `resolveConfig`, aber ohne zu werfen – für Admin-Eingaben. */
export function tryResolveConfig(...overrides: (ConfigOverride | undefined)[]) {
  return GameConfigSchema.safeParse(deepMerge({}, ...overrides));
}

/** Gespeichertes Preset (versioniert, in DynamoDB). */
export const PresetSchema = z.object({
  presetId: z.string().min(1).max(64),
  version: z.number().int().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  configSchemaVersion: z.number().int().default(CONFIG_SCHEMA_VERSION),
  override: ConfigOverrideSchema,
  createdAt: z.iso.datetime(),
  createdBy: z.string().optional(),
});
export type Preset = z.infer<typeof PresetSchema>;
