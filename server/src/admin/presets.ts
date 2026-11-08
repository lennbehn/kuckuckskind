import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CONFIG_SCHEMA_VERSION,
  PresetSchema,
  type ConfigOverride,
  type Preset,
  type PresetInput,
} from '@kuckuckskind/shared';
import type { Logger } from '../log.ts';

/** Versionierte Parameter-Presets: jede Speicherung ist eine neue Version, nichts wird überschrieben. */
export interface PresetStore {
  /** Neueste Version je Preset, nach Name sortiert. */
  listLatest(): Promise<Preset[]>;
  /** Alle Versionen eines Presets, neueste zuerst. */
  versions(presetId: string): Promise<Preset[]>;
  /** Bestimmte oder neueste Version. */
  get(presetId: string, version?: number): Promise<Preset | null>;
  save(input: PresetInput, createdBy?: string): Promise<Preset>;
}

/** Preset-ID aus dem Namen: „Testabend 1“ → „testabend-1“. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'preset';
}

function build(input: PresetInput, version: number, createdBy?: string): Preset {
  return {
    presetId: input.presetId ?? slugify(input.name),
    version,
    name: input.name,
    description: input.description ?? '',
    configSchemaVersion: CONFIG_SCHEMA_VERSION,
    override: input.override as Record<string, unknown>,
    createdAt: new Date().toISOString(),
    ...(createdBy ? { createdBy } : {}),
  };
}

const latestPerId = (all: Preset[]) => {
  const best = new Map<string, Preset>();
  for (const p of all) {
    const cur = best.get(p.presetId);
    if (!cur || p.version > cur.version) best.set(p.presetId, p);
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
};

export class MemoryPresetStore implements PresetStore {
  private readonly items: Preset[] = [];

  async listLatest() {
    return latestPerId(this.items);
  }
  async versions(presetId: string) {
    return this.items.filter((p) => p.presetId === presetId).sort((a, b) => b.version - a.version);
  }
  async get(presetId: string, version?: number) {
    const all = await this.versions(presetId);
    return (version === undefined ? all[0] : all.find((p) => p.version === version)) ?? null;
  }
  async save(input: PresetInput, createdBy?: string) {
    const id = input.presetId ?? slugify(input.name);
    const latest = await this.get(id);
    const preset = build({ ...input, presetId: id }, (latest?.version ?? 0) + 1, createdBy);
    this.items.push(preset);
    return preset;
  }
}

/** DynamoDB: presetId (PK), version (SK); Werte als JSON-Text. */
export class DynamoPresetStore implements PresetStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly table: string,
    private readonly log: Logger,
    client = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client);
  }

  private parse(item: Record<string, unknown>): Preset | null {
    const parsed = PresetSchema.safeParse({
      ...item,
      override: JSON.parse(String(item.override ?? '{}')) as ConfigOverride,
    });
    if (!parsed.success) this.log.warn('preset unlesbar', { presetId: item.presetId });
    return parsed.success ? parsed.data : null;
  }

  async listLatest() {
    const all: Preset[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new ScanCommand({ TableName: this.table, ExclusiveStartKey: startKey }),
      );
      for (const item of page.Items ?? []) {
        const p = this.parse(item);
        if (p) all.push(p);
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return latestPerId(all);
  }

  async versions(presetId: string) {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'presetId = :id',
        ExpressionAttributeValues: { ':id': presetId },
        ScanIndexForward: false,
      }),
    );
    return (res.Items ?? []).map((i) => this.parse(i)).filter((p): p is Preset => !!p);
  }

  async get(presetId: string, version?: number) {
    const all = await this.versions(presetId);
    return (version === undefined ? all[0] : all.find((p) => p.version === version)) ?? null;
  }

  async save(input: PresetInput, createdBy?: string) {
    const id = input.presetId ?? slugify(input.name);
    // Bedingtes Schreiben: zwei gleichzeitige Speicherungen bekommen nie dieselbe Version.
    for (let attempt = 0; attempt < 5; attempt++) {
      const latest = await this.get(id);
      const preset = build({ ...input, presetId: id }, (latest?.version ?? 0) + 1, createdBy);
      try {
        await this.doc.send(
          new PutCommand({
            TableName: this.table,
            Item: { ...preset, override: JSON.stringify(preset.override) },
            ConditionExpression: 'attribute_not_exists(presetId)',
          }),
        );
        return preset;
      } catch (err) {
        if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
      }
    }
    throw new Error('Preset konnte nicht gespeichert werden (gleichzeitige Änderung).');
  }
}
