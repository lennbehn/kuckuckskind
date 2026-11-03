import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { RoomSnapshotSchema, type RoomSnapshot } from './snapshot.ts';
import type { Logger } from '../log.ts';

/** Ablage für Raum-Snapshots, damit Räume einen Neustart/Deploy überleben. */
export interface RoomStore {
  save(snapshot: RoomSnapshot, expiresAt: number): Promise<void>;
  delete(code: string): Promise<void>;
  /** Alle noch nicht abgelaufenen Snapshots. */
  loadAll(now: number): Promise<RoomSnapshot[]>;
}

export class MemoryRoomStore implements RoomStore {
  readonly items = new Map<string, { snapshot: RoomSnapshot; expiresAt: number }>();

  async save(snapshot: RoomSnapshot, expiresAt: number) {
    this.items.set(snapshot.code, { snapshot: structuredClone(snapshot), expiresAt });
  }

  async delete(code: string) {
    this.items.delete(code);
  }

  async loadAll(now: number) {
    return [...this.items.values()]
      .filter((i) => i.expiresAt > now)
      .map((i) => structuredClone(i.snapshot));
  }
}

/** DynamoDB-Tabelle: roomCode (PK), snapshot (JSON), expiresAt (TTL, Sekunden). */
export class DynamoRoomStore implements RoomStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly table: string,
    private readonly log: Logger,
    client = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client);
  }

  async save(snapshot: RoomSnapshot, expiresAt: number) {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          roomCode: snapshot.code,
          snapshot: JSON.stringify(snapshot),
          expiresAt: Math.floor(expiresAt / 1000),
        },
      }),
    );
  }

  async delete(code: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { roomCode: code } }));
  }

  async loadAll(now: number) {
    const out: RoomSnapshot[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new ScanCommand({
          TableName: this.table,
          ExclusiveStartKey: startKey,
          FilterExpression: 'expiresAt > :now',
          ExpressionAttributeValues: { ':now': Math.floor(now / 1000) },
        }),
      );
      for (const item of page.Items ?? []) {
        const parsed = RoomSnapshotSchema.safeParse(JSON.parse(String(item.snapshot)));
        if (parsed.success) out.push(parsed.data);
        else this.log.warn('snapshot unlesbar', { code: item.roomCode });
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return out;
  }
}
