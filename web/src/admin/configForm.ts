import {
  GameConfigSchema,
  defaultGameConfig,
  tryResolveConfig,
  type ConfigOverride,
  type GameConfig,
} from '@kuckuckskind/shared';

/** JSON-Schema-Knoten, wie z.toJSONSchema ihn liefert (mit unseren Meta-Feldern). */
export interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  label?: string;
  description?: string;
  unit?: string;
  step?: number;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  const?: unknown;
  anyOf?: SchemaNode[];
  items?: SchemaNode;
  default?: unknown;
}

/** Das Formular entsteht aus dem Zod-Schema – neue Spielwerte erscheinen automatisch. */
export const CONFIG_SCHEMA = GameConfigSchema.toJSONSchema({
  io: 'input',
  unrepresentable: 'any',
}) as SchemaNode;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function getIn(obj: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), obj);
}

export function setIn<T>(obj: T, path: readonly string[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path as [string, ...string[]];
  const base: Obj = isObj(obj) ? obj : {};
  return { ...base, [head]: setIn(base[head], rest, value) } as T;
}

/** Nur die Werte, die vom Standard abweichen (das wird als Preset gespeichert). */
export function diffFromDefaults(
  value: unknown,
  defaults: unknown = defaultGameConfig,
): ConfigOverride {
  if (isObj(value) && isObj(defaults)) {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) {
      const d = diffFromDefaults(v, defaults[k]);
      if (d !== undefined) out[k] = d;
    }
    return (Object.keys(out).length ? out : undefined) as ConfigOverride;
  }
  return (JSON.stringify(value) === JSON.stringify(defaults) ? undefined : value) as ConfigOverride;
}

export function countLeaves(o: unknown): number {
  return isObj(o)
    ? Object.values(o).reduce<number>((n, v) => n + countLeaves(v), 0)
    : o === undefined
      ? 0
      : 1;
}

/** Prüft die Werte; Fehler je Pfad („timing.stationSeconds“). */
export function validate(config: GameConfig): Record<string, string> {
  const result = tryResolveConfig(diffFromDefaults(config) ?? {});
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

/** Vollständige Konfiguration aus einem Override (fürs Bearbeiten). */
export function configFrom(override: ConfigOverride | undefined): GameConfig {
  const r = tryResolveConfig(override ?? {});
  return r.success ? r.data : structuredClone(defaultGameConfig);
}

export const ENUM_LABEL: Record<string, string> = {
  blow: 'Pusten',
  rock: 'Wiegen',
  cover: 'Zudecken',
  feed: 'Füttern',
  sing: 'Vorsingen',
  objective: 'objektiv',
  relative: 'relativ zur Runde',
  runoff: 'Stichwahl',
  nobody: 'niemand beschuldigt',
};
