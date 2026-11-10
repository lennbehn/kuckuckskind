import { createHash, randomInt } from 'node:crypto';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ModuleId,
  type ServerMessage,
} from '@kuckuckskind/shared';
import type { Logger } from '../log.ts';
import { RoomError } from './errors.ts';
import { Room, type Player, type RoomDeps } from './room.ts';
import type { RoomStore } from './store.ts';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export interface Session {
  room: Room;
  playerId: string;
}

export interface RoomManagerOptions {
  store: RoomStore;
  log: Logger;
  now?: () => number;
  availableModules?: readonly ModuleId[];
  /** Raum wird gelöscht, wenn so lange niemand verbunden war. */
  idleRoomMs?: number;
  /** Snapshot läuft so lange nach der letzten Änderung ab. */
  snapshotTtlMs?: number;
  saveDebounceMs?: number;
  /** Wird bei jeder Raumänderung aufgerufen (zum Senden). */
  onRoomChanged?: (room: Room) => void;
  onPlayerRemoved?: (room: Room, player: Player, reason: 'left' | 'kicked' | 'expired') => void;
  /** Nachricht an das Handy genau eines Spielers. */
  onNotify?: (room: Room, player: Player, message: ServerMessage) => void;
}

/** Module, die gebaut sind (in der Lobby schaltbar). */
export const BUILT_MODULES: readonly ModuleId[] = ['falcon', 'feathers', 'owl'];

/** Verwaltet alle Räume eines Server-Prozesses und die Zuordnung Sitzung → Spieler. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, { code: string; playerId: string }>();
  private readonly pendingSaves = new Map<string, NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly idleRoomMs: number;
  private readonly snapshotTtlMs: number;
  private readonly saveDebounceMs: number;
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly opts: RoomManagerOptions) {
    this.now = opts.now ?? Date.now;
    this.idleRoomMs = opts.idleRoomMs ?? 30 * 60_000;
    this.snapshotTtlMs = opts.snapshotTtlMs ?? 6 * 3600_000;
    this.saveDebounceMs = opts.saveDebounceMs ?? 500;
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  private deps(): RoomDeps {
    return {
      now: this.now,
      schedule: (at, fn) => {
        const t = setTimeout(fn, Math.max(0, at - this.now()));
        return () => clearTimeout(t);
      },
      onChange: (room) => {
        if (this.rooms.get(room.code) !== room) return;
        this.scheduleSave(room);
        this.opts.onRoomChanged?.(room);
      },
      onPlayerRemoved: (room, player, reason) => {
        if (room.phase === 'lobby') this.sessions.delete(player.tokenHash);
        this.opts.onPlayerRemoved?.(room, player, reason);
      },
      availableModules: this.opts.availableModules ?? BUILT_MODULES,
      notify: (room, playerId, message) => {
        const player = room.players.get(playerId);
        if (player && this.rooms.get(room.code) === room)
          this.opts.onNotify?.(room, player, message);
      },
    };
  }

  // --- Sitzungen ----------------------------------------------------------------

  sessionFor(tokenHash: string): Session | null {
    const s = this.sessions.get(tokenHash);
    if (!s) return null;
    const room = this.rooms.get(s.code);
    if (!room || !room.players.has(s.playerId)) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return { room, playerId: s.playerId };
  }

  create(name: string, tokenHash: string): Session {
    this.leave(tokenHash);
    const room = new Room(this.newCode(), this.now(), this.deps());
    this.rooms.set(room.code, room);
    const player = room.addPlayer(name, tokenHash);
    this.sessions.set(tokenHash, { code: room.code, playerId: player.id });
    this.opts.log.info('raum erstellt', { room: room.code });
    return { room, playerId: player.id };
  }

  join(code: string, name: string, tokenHash: string): Session {
    const existing = this.sessionFor(tokenHash);
    if (existing?.room.code === code) return existing;
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('room_not_found', `Raum ${code} gibt es nicht.`);
    const player = room.addPlayer(name, tokenHash);
    this.leave(tokenHash);
    this.sessions.set(tokenHash, { code, playerId: player.id });
    return { room, playerId: player.id };
  }

  leave(tokenHash: string) {
    const s = this.sessionFor(tokenHash);
    if (!s) return;
    this.sessions.delete(tokenHash);
    s.room.removePlayer(s.playerId, 'left');
    this.deleteIfEmpty(s.room);
  }

  // --- Speichern & Aufräumen ----------------------------------------------------

  /** Räume aus dem Speicher laden (beim Start). */
  async restore() {
    const snaps = await this.opts.store.loadAll(this.now());
    for (const snap of snaps) {
      if (this.rooms.has(snap.code)) continue;
      const room = Room.restore(snap, this.deps());
      this.rooms.set(room.code, room);
      for (const p of room.players.values()) {
        this.sessions.set(p.tokenHash, { code: room.code, playerId: p.id });
      }
      // Phasenwechsel während der Ausfallzeit (z. B. Takt abgelaufen) mitspeichern.
      this.scheduleSave(room);
    }
    this.opts.log.info('räume wiederhergestellt', { count: snaps.length });
  }

  private scheduleSave(room: Room) {
    if (this.pendingSaves.has(room.code)) return;
    const t = setTimeout(() => {
      this.pendingSaves.delete(room.code);
      void this.save(room);
    }, this.saveDebounceMs);
    t.unref();
    this.pendingSaves.set(room.code, t);
  }

  private async save(room: Room) {
    if (this.rooms.get(room.code) !== room) return;
    try {
      await this.opts.store.save(room.snapshot(), this.now() + this.snapshotTtlMs);
    } catch (err) {
      this.opts.log.error('snapshot speichern fehlgeschlagen', {
        room: room.code,
        err: String(err),
      });
    }
  }

  /** Alle offenen Snapshots sofort schreiben (beim Herunterfahren). */
  async flush() {
    const codes = [...this.pendingSaves.keys()];
    for (const code of codes) clearTimeout(this.pendingSaves.get(code));
    this.pendingSaves.clear();
    await Promise.all(
      codes
        .map((c) => this.rooms.get(c))
        .filter((r): r is Room => !!r)
        .map((r) => this.save(r)),
    );
  }

  /** Räume ohne Verbindung seit `idleRoomMs` löschen. */
  sweep() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.connectedCount > 0) continue;
      const lastSeen = Math.max(
        room.createdAt,
        ...[...room.players.values()].map((p) => p.lastSeenAt),
      );
      if (now - lastSeen > this.idleRoomMs) this.deleteRoom(room);
    }
  }

  private deleteIfEmpty(room: Room) {
    if (room.players.size === 0) this.deleteRoom(room);
  }

  private deleteRoom(room: Room) {
    room.dispose();
    this.rooms.delete(room.code);
    clearTimeout(this.pendingSaves.get(room.code));
    this.pendingSaves.delete(room.code);
    for (const p of room.players.values()) this.sessions.delete(p.tokenHash);
    void this.opts.store.delete(room.code).catch((err) =>
      this.opts.log.error('snapshot löschen fehlgeschlagen', {
        room: room.code,
        err: String(err),
      }),
    );
    this.opts.log.info('raum gelöscht', { room: room.code });
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('internal', 'Kein freier Raumcode.');
  }

  dispose() {
    clearInterval(this.sweeper);
    for (const t of this.pendingSaves.values()) clearTimeout(t);
    for (const room of this.rooms.values()) room.dispose();
  }
}
