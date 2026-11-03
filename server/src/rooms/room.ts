import { randomInt, randomUUID } from 'node:crypto';
import {
  assignRoles,
  createRng,
  createTimeline,
  hostSettingsToOverride,
  nextBoundary,
  pauseTimeline,
  positionAt,
  resumeTimeline,
  skipStage,
  totalRounds,
  tryResolveConfig,
  type CareKind,
  type CareMethod,
  type ConfigOverride,
  type DeviceCalibration,
  type GameConfig,
  type GameControl,
  type HostSettings,
  type ModuleId,
  type Role,
  type RoomPhase,
  type RoomView,
  type Timeline,
} from '@kuckuckskind/shared';
import { RoomError } from './errors.ts';
import { SNAPSHOT_VERSION, type RoomSnapshot } from './snapshot.ts';

export interface Player {
  id: string;
  name: string;
  tokenHash: string;
  joinedAt: number;
  lastSeenAt: number;
  connected: boolean;
}

export interface RoomDeps {
  now(): number;
  /** Ruft `fn` zum Server-Zeitpunkt `at` auf; liefert eine Abbruch-Funktion. */
  schedule(at: number, fn: () => void): () => void;
  /** Zustand hat sich geändert → an alle senden und speichern. */
  onChange(room: Room): void;
  /** Spieler wurde entfernt (verlassen, rausgeworfen, abgelaufen). */
  onPlayerRemoved(room: Room, player: Player, reason: 'left' | 'kicked' | 'expired'): void;
  /** Module, die gebaut sind und eingeschaltet werden dürfen. */
  availableModules: readonly ModuleId[];
}

/**
 * Ein Raum = ein Zustandsautomat im Speicher.
 *
 *   lobby ──start──▶ hatching ──(alle Eier fertig)──▶ rounds ──(Takt abgelaufen)──▶ homecoming
 *     ▲                  │                               │                            │
 *     └───────abort──────┴───────────────abort───────────┴────────────abort───────────┘
 *
 * Beim Schlüpfen werden die Rollen verteilt; `rounds` beginnt mit gemeinsamem Schlüpfen und
 * der geheimen Rollen-Einblendung (bis `hatch.revealEndsAt`), danach läuft der Takt.
 * M4 fügt Spick-Wahl, Abstimmung und Wertung ein.
 * Alle Zeiten sind Server-Zeit; Clients rechnen den Takt selbst aus `timeline`.
 */
export class Room {
  phase: RoomPhase = 'lobby';
  hostId: string;
  readonly players = new Map<string, Player>();
  seating: string[] = [];
  settings: HostSettings = {};
  /** Preset aus dem Admin-Bereich (M6). */
  presetOverride: ConfigOverride = {};
  config: GameConfig;
  timeline: Timeline | null = null;
  finishedAt: number | null = null;
  /** Je Spieler die beim Ausbrüten geschafften Pflegearten und wie (Sensor/Ersatz). */
  readonly hatched = new Map<string, Map<CareKind, CareMethod>>();
  /** Technik-Check je Spieler (für Hinweise und Admin-Debug). */
  readonly calibrations = new Map<string, DeviceCalibration>();
  hatch: { at: number; revealEndsAt: number } | null = null;
  /** Geheim: nur auf dem Server. */
  roles: Record<string, Role> | null = null;
  /** Zufalls-Seed der Partie (für reproduzierbare Simulation in M4). */
  seed: number | null = null;

  private cancelTimer: (() => void) | null = null;
  private cancelRevealTimer: (() => void) | null = null;
  private readonly removalTimers = new Map<string, () => void>();

  constructor(
    readonly code: string,
    readonly createdAt: number,
    private readonly deps: RoomDeps,
  ) {
    this.hostId = '';
    this.config = this.resolve(this.settings);
  }

  // --- Spieler -------------------------------------------------------------

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  addPlayer(name: string, tokenHash: string): Player {
    if (this.phase !== 'lobby') {
      throw new RoomError('room_in_progress', 'Die Partie läuft schon.');
    }
    if (this.players.size >= this.config.room.maxPlayers) {
      throw new RoomError('room_full', `Der Raum ist voll (${this.config.room.maxPlayers}).`);
    }
    const lower = name.toLocaleLowerCase('de');
    if ([...this.players.values()].some((p) => p.name.toLocaleLowerCase('de') === lower)) {
      throw new RoomError('name_taken', `„${name}“ ist schon dabei.`);
    }
    const now = this.deps.now();
    const player: Player = {
      id: randomUUID().slice(0, 8),
      name,
      tokenHash,
      joinedAt: now,
      lastSeenAt: now,
      connected: true,
    };
    this.players.set(player.id, player);
    this.seating.push(player.id);
    if (!this.hostId) this.hostId = player.id;
    this.changed();
    return player;
  }

  /** Spieler verlässt den Raum. Während der Partie bleibt er am Tisch (Sitzordnung!). */
  removePlayer(playerId: string, reason: 'left' | 'kicked' | 'expired') {
    const player = this.players.get(playerId);
    if (!player) return;
    this.removalTimers.get(playerId)?.();
    this.removalTimers.delete(playerId);
    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      this.seating = this.seating.filter((id) => id !== playerId);
      if (this.hostId === playerId) this.hostId = this.seating[0] ?? '';
    } else {
      player.connected = false;
    }
    this.deps.onPlayerRemoved(this, player, reason);
    this.changed();
  }

  setConnected(playerId: string, connected: boolean) {
    const player = this.players.get(playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    player.lastSeenAt = this.deps.now();
    this.removalTimers.get(playerId)?.();
    this.removalTimers.delete(playerId);
    if (!connected && this.phase === 'lobby') this.scheduleRemoval(player);
    this.changed();
  }

  /** In der Lobby: Getrennte verlieren ihren Platz nach der Gnadenfrist. */
  private scheduleRemoval(player: Player) {
    this.removalTimers.get(player.id)?.();
    const at = player.lastSeenAt + this.config.timing.reconnectGraceSeconds * 1000;
    this.removalTimers.set(
      player.id,
      this.deps.schedule(at, () => {
        if (!this.players.get(player.id)?.connected) this.removePlayer(player.id, 'expired');
      }),
    );
  }

  // --- Lobby ---------------------------------------------------------------

  setSeating(by: string, order: readonly string[]) {
    this.requireHost(by);
    this.requirePhase('lobby');
    const ids = new Set(this.players.keys());
    if (
      order.length !== ids.size ||
      new Set(order).size !== order.length ||
      !order.every((id) => ids.has(id))
    ) {
      throw new RoomError('bad_message', 'Sitzordnung muss jeden Spieler genau einmal enthalten.');
    }
    this.seating = [...order];
    this.changed();
  }

  updateSettings(by: string, patch: HostSettings) {
    this.requireHost(by);
    this.requirePhase('lobby');
    for (const [id, on] of Object.entries(patch.modules ?? {})) {
      if (on && !this.deps.availableModules.includes(id as ModuleId)) {
        throw new RoomError('invalid_settings', `Modul „${id}“ gibt es noch nicht.`);
      }
    }
    const next: HostSettings = {
      ...this.settings,
      ...patch,
      modules: { ...this.settings.modules, ...patch.modules },
    };
    this.config = this.resolve(next);
    this.settings = next;
    this.changed();
  }

  kick(by: string, playerId: string) {
    this.requireHost(by);
    this.requirePhase('lobby');
    if (playerId === by)
      throw new RoomError('not_allowed', 'Du kannst dich nicht selbst entfernen.');
    if (!this.players.has(playerId)) throw new RoomError('bad_message', 'Unbekannter Spieler.');
    this.removePlayer(playerId, 'kicked');
  }

  /** Neues Preset (Admin) – nur in der Lobby. */
  applyPreset(override: ConfigOverride) {
    this.requirePhase('lobby');
    const prev = this.presetOverride;
    this.presetOverride = override;
    try {
      this.config = this.resolve(this.settings);
    } catch (err) {
      this.presetOverride = prev;
      throw err;
    }
    this.changed();
  }

  // --- Partie ----------------------------------------------------------------

  start(by: string) {
    this.requireHost(by);
    this.requirePhase('lobby');
    const n = this.players.size;
    if (n < this.config.room.minPlayers) {
      throw new RoomError(
        'not_allowed',
        `Mindestens ${this.config.room.minPlayers} Spieler nötig.`,
      );
    }
    this.resetGame();
    this.phase = 'hatching';
    this.changed();
  }

  /** Eine Pflegeart am eigenen Ei geschafft. Sind alle fertig, schlüpfen alle gemeinsam. */
  recordHatch(playerId: string, kind: CareKind, method: CareMethod) {
    this.requirePhase('hatching');
    if (!this.config.care.activeKinds.includes(kind)) {
      throw new RoomError('bad_message', 'Diese Pflegeart ist nicht aktiv.');
    }
    const done = this.hatched.get(playerId) ?? new Map<CareKind, CareMethod>();
    if (done.get(kind) === method) return;
    done.set(kind, method);
    this.hatched.set(playerId, done);
    if (this.allHatched()) this.hatchAll();
    else this.changed();
  }

  setCalibration(playerId: string, calibration: DeviceCalibration) {
    if (!this.players.has(playerId)) return;
    this.calibrations.set(playerId, calibration);
    this.changed();
  }

  private allHatched() {
    const kinds = this.config.care.activeKinds;
    return [...this.players.keys()].every((id) => kinds.every((k) => this.hatched.get(id)?.has(k)));
  }

  /**
   * Alle Küken schlüpfen zum selben Zeitpunkt (mit Vorlauf), dann geheime Rollen-Einblendung,
   * dann kurze Pause und Runde 1.
   */
  private hatchAll() {
    const t = this.config.timing;
    const at = this.deps.now() + t.nextLeadMs;
    const revealEndsAt = at + this.config.hatching.hatchAnimationMs + t.roleRevealMs;
    this.seed = randomInt(2 ** 31);
    this.roles = assignRoles(this.seating, this.config, createRng(this.seed));
    this.hatch = { at, revealEndsAt };
    this.timeline = createTimeline({
      startsAt: revealEndsAt + this.config.hatching.settleMs,
      stationMs: t.stationSeconds * 1000,
      handoverMs: t.handoverSeconds * 1000,
      rounds: totalRounds(this.config, this.seating.length),
    });
    this.phase = 'rounds';
    this.armRevealTimer();
    this.armTimer();
    this.changed();
  }

  /** Nach der Einblendung neu senden – ab dann ohne Rolle. */
  private armRevealTimer() {
    this.cancelRevealTimer?.();
    this.cancelRevealTimer = null;
    if (!this.hatch || this.deps.now() >= this.hatch.revealEndsAt) return;
    this.cancelRevealTimer = this.deps.schedule(this.hatch.revealEndsAt, () => {
      this.cancelRevealTimer = null;
      this.changed();
    });
  }

  private resetGame() {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.cancelRevealTimer?.();
    this.cancelRevealTimer = null;
    this.timeline = null;
    this.finishedAt = null;
    this.hatched.clear();
    this.hatch = null;
    this.roles = null;
    this.seed = null;
  }

  control(by: string, action: GameControl) {
    this.requireHost(by);
    if (action === 'abort') return this.backToLobby();
    if (action === 'hatchNow') {
      this.requirePhase('hatching');
      return this.hatchAll();
    }
    this.requirePhase('rounds');
    const tl = this.timeline as Timeline;
    const now = this.deps.now();
    const lead = this.config.timing.nextLeadMs;
    const next =
      action === 'pause'
        ? pauseTimeline(tl, now)
        : action === 'resume'
          ? resumeTimeline(tl, now + lead)
          : skipStage(tl, now, lead);
    if (next === tl) return;
    this.timeline = next;
    this.armTimer();
    this.changed();
  }

  private backToLobby() {
    this.resetGame();
    this.phase = 'lobby';
    // Wer während der Partie gegangen ist, verliert jetzt seinen Platz nach der Gnadenfrist.
    for (const p of this.players.values()) if (!p.connected) this.scheduleRemoval(p);
    this.changed();
  }

  /** Timer auf die nächste Takt-Grenze; am Ende → Heimkehr. */
  private armTimer() {
    this.cancelTimer?.();
    this.cancelTimer = null;
    if (this.phase !== 'rounds' || !this.timeline) return;
    const now = this.deps.now();
    if (positionAt(this.timeline, now).stage === 'done') {
      this.phase = 'homecoming';
      this.finishedAt = now;
      this.changed();
      return;
    }
    const at = nextBoundary(this.timeline, now);
    if (at !== null) this.cancelTimer = this.deps.schedule(at, () => this.armTimer());
  }

  dispose() {
    this.cancelTimer?.();
    this.cancelRevealTimer?.();
    for (const cancel of this.removalTimers.values()) cancel();
    this.removalTimers.clear();
  }

  // --- Ansichten & Speichern ---------------------------------------------------

  viewFor(playerId: string): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: this.seating.map((id) => {
        const p = this.players.get(id) as Player;
        return {
          id: p.id,
          name: p.name,
          connected: p.connected,
          hatched: [...(this.hatched.get(id)?.keys() ?? [])],
        };
      }),
      config: this.config,
      settings: this.settings,
      availableModules: [...this.deps.availableModules],
      timeline: this.timeline,
      hatch: this.hatch,
      you: { playerId, ...this.secretsFor(playerId) },
    };
  }

  /** Geheimes nur für diesen Spieler – die Rolle nur bis zum Ende der Einblendung. */
  private secretsFor(playerId: string): { role?: Role } {
    const role = this.roles?.[playerId];
    if (!role || !this.hatch || this.deps.now() >= this.hatch.revealEndsAt) return {};
    return { role };
  }

  /** Rolle eines Spielers (nur serverintern, z. B. Wertung). */
  roleOf(playerId: string): Role | null {
    return this.roles?.[playerId] ?? null;
  }

  snapshot(): RoomSnapshot {
    return {
      v: SNAPSHOT_VERSION,
      code: this.code,
      createdAt: this.createdAt,
      phase: this.phase,
      hostId: this.hostId,
      players: [...this.players.values()].map(({ connected: _c, ...p }) => p),
      seating: [...this.seating],
      presetOverride: this.presetOverride as Record<string, unknown>,
      settings: this.settings,
      timeline: this.timeline,
      finishedAt: this.finishedAt,
      hatched: Object.fromEntries(
        [...this.hatched].map(([id, kinds]) => [id, Object.fromEntries(kinds)]),
      ),
      calibrations: Object.fromEntries(this.calibrations),
      hatch: this.hatch,
      roles: this.roles,
      seed: this.seed,
    };
  }

  /** Raum aus Snapshot wiederherstellen; alle Spieler gelten als getrennt, bis sie sich melden. */
  static restore(snap: RoomSnapshot, deps: RoomDeps): Room {
    const room = new Room(snap.code, snap.createdAt, deps);
    room.phase = snap.phase;
    room.hostId = snap.hostId;
    for (const p of snap.players) room.players.set(p.id, { ...p, connected: false });
    room.seating = [...snap.seating];
    room.presetOverride = snap.presetOverride as ConfigOverride;
    room.settings = snap.settings;
    room.config = room.resolve(snap.settings);
    room.timeline = snap.timeline;
    room.finishedAt = snap.finishedAt;
    for (const [id, kinds] of Object.entries(snap.hatched)) {
      room.hatched.set(id, new Map(Object.entries(kinds) as [CareKind, CareMethod][]));
    }
    for (const [id, cal] of Object.entries(snap.calibrations)) room.calibrations.set(id, cal);
    room.hatch = snap.hatch;
    room.roles = snap.roles;
    room.seed = snap.seed;
    room.armRevealTimer();
    room.armTimer();
    if (room.phase === 'lobby') for (const p of room.players.values()) room.scheduleRemoval(p);
    return room;
  }

  // --- Hilfen ------------------------------------------------------------------

  private resolve(settings: HostSettings): GameConfig {
    const result = tryResolveConfig(this.presetOverride, hostSettingsToOverride(settings));
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new RoomError(
        'invalid_settings',
        issue ? `${issue.path.join('.')}: ${issue.message}` : 'Ungültige Einstellungen',
      );
    }
    return result.data;
  }

  private requireHost(playerId: string) {
    if (playerId !== this.hostId) throw new RoomError('not_allowed', 'Nur der Host darf das.');
  }

  private requirePhase(phase: RoomPhase) {
    if (this.phase !== phase) throw new RoomError('not_allowed', 'Gerade nicht möglich.');
  }

  private changed() {
    this.deps.onChange(this);
  }
}
