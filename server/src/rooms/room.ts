import { randomInt, randomUUID } from 'node:crypto';
import {
  assignRoles,
  createRng,
  createTimeline,
  decideVote,
  generateHints,
  hostSettingsToOverride,
  nextBoundary,
  pauseTimeline,
  peekOptions,
  peekRound,
  positionAt,
  resumeTimeline,
  rollCharacter,
  scoreGame,
  skipStage,
  tallyVotes,
  totalRounds,
  tryResolveConfig,
  type CareKind,
  type CareMethod,
  type DeviceLevels,
  type LogEntry,
  type RoomDebug,
  type RoomPresetRef,
  type RoomSummary,
  type ChickOutcome,
  type ChickReport,
  type ConfigOverride,
  type DeviceCalibration,
  type GameConfig,
  type GameControl,
  type HostSettings,
  type ModuleId,
  type Role,
  type RoomPhase,
  type RoomView,
  type StationStats,
  type Timeline,
} from '@kuckuckskind/shared';
import { RoomError } from './errors.ts';
import { SNAPSHOT_VERSION, type MatchState, type RoomSnapshot } from './snapshot.ts';

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

const CARE_DE: Record<CareKind, string> = {
  blow: 'Pusten',
  rock: 'Wiegen',
  cover: 'Zudecken',
  feed: 'Füttern',
  sing: 'Vorsingen',
};

const PHASE_DE: Record<RoomPhase, string> = {
  lobby: 'Lobby',
  hatching: 'Ausbrüten',
  peekChoice: 'Spick-Wahl',
  rounds: 'Runden',
  homecoming: 'Heimkehr',
  voting: 'Abstimmung',
  reveal: 'Enthüllung',
};

const REMOVE_TEXT = {
  left: 'hat den Raum verlassen',
  kicked: 'wurde entfernt',
  expired: 'war zu lange weg',
};

/** Phasen, in denen eine Partie läuft (Küken existieren). */
const MATCH_PHASES: readonly RoomPhase[] = [
  'peekChoice',
  'rounds',
  'homecoming',
  'voting',
  'reveal',
];
/** Phasen, in denen der Zustand der Küken öffentlich ist. */
const PUBLIC_CHICK_PHASES: readonly RoomPhase[] = ['homecoming', 'voting', 'reveal'];

/**
 * Ein Raum = ein Zustandsautomat im Speicher.
 *
 *   lobby ─start─▶ hatching ─(alle Eier)─▶ peekChoice ─(alle gewählt/Frist)─▶ rounds
 *     ▲                                                                         │ Takt zu Ende
 *     │                                                                         ▼
 *     └──────────────abort (jederzeit, Host)──────── reveal ◀─closeVoting─ voting ◀─ homecoming
 *
 * - peekChoice beginnt mit gemeinsamem Schlüpfen und geheimer Rollen-Einblendung
 *   (bis hatch.revealEndsAt), danach wählt jeder geheim seine Spick-Station.
 * - Während der Runden rechnet jedes Handy sein Küken selbst und meldet Stand und
 *   Stationsstatistik; der Server sammelt, erzeugt daraus Hinweise und wertet.
 * - Geheimes (Rollen, Spick-Wahl, Stimmen) steckt in `match` und geht nur gefiltert über
 *   `viewFor` an genau den Spieler, der es sehen darf.
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
  /** Je Spieler die beim Ausbrüten geschafften Pflegearten und wie (Sensor/Ersatz). */
  readonly hatched = new Map<string, Map<CareKind, CareMethod>>();
  /** Technik-Check je Spieler (für Hinweise und Admin-Debug). */
  readonly calibrations = new Map<string, DeviceCalibration>();
  /** Laufende Partie ab dem Schlüpfen; null in Lobby und beim Ausbrüten. */
  match: MatchState | null = null;
  /** Herkunft der Konfiguration (Preset oder eigene Werte des Admins). */
  presetRef: RoomPresetRef | null = null;
  /** Live-Debug: Messwerte je Gerät und Ereignislog (nur für den Admin-Bereich). */
  readonly levels = new Map<string, DeviceLevels>();
  readonly events: LogEntry[] = [];
  /** Ein Admin schaut zu bis … (dann senden die Handys Messwerte). */
  debugUntil: number | null = null;
  private loggedPhase: RoomPhase = 'lobby';

  private cancelTimer: (() => void) | null = null;
  private cancelRevealTimer: (() => void) | null = null;
  private cancelPhaseTimer: (() => void) | null = null;
  private readonly removalTimers = new Map<string, () => void>();

  constructor(
    readonly code: string,
    readonly createdAt: number,
    private readonly deps: RoomDeps,
  ) {
    this.hostId = '';
    this.config = this.resolve(this.settings);
  }

  get timeline(): Timeline | null {
    return this.match?.timeline ?? null;
  }
  get hatch() {
    return this.match?.hatch ?? null;
  }
  get roles(): Record<string, Role> | null {
    return this.match?.roles ?? null;
  }
  get finishedAt(): number | null {
    return this.match?.finishedAt ?? null;
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
    this.log('join', `${name} ist beigetreten`, player.id);
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
    this.log('leave', `${player.name} ${REMOVE_TEXT[reason]}`, playerId);
    this.deps.onPlayerRemoved(this, player, reason);
    this.changed();
  }

  setConnected(playerId: string, connected: boolean) {
    const player = this.players.get(playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    player.lastSeenAt = this.deps.now();
    this.log(
      connected ? 'online' : 'offline',
      `${player.name} ${connected ? 'wieder verbunden' : 'getrennt'}`,
      playerId,
    );
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

  /** Preset oder eigene Werte (Admin/Host) – nur in der Lobby. */
  applyPreset(override: ConfigOverride, ref: RoomPresetRef | null = null) {
    this.requirePhase('lobby');
    const prev = this.presetOverride;
    this.presetOverride = override;
    try {
      this.config = this.resolve(this.settings);
    } catch (err) {
      this.presetOverride = prev;
      throw err;
    }
    this.presetRef = ref;
    this.log(
      'config',
      ref
        ? `Konfiguration: ${ref.name}${ref.version ? ` v${ref.version}` : ''}`
        : 'Konfiguration: Standardwerte',
    );
    this.changed();
  }

  // --- Live-Debug ----------------------------------------------------------

  /** Eintrag ins Ereignislog (ohne Geheimes – das steht getrennt in der Debug-Ansicht). */
  log(type: string, text: string, playerId?: string) {
    this.events.push({ at: this.deps.now(), type, text, ...(playerId ? { playerId } : {}) });
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  setLevels(playerId: string, levels: DeviceLevels) {
    if (this.players.has(playerId)) this.levels.set(playerId, levels);
  }

  /** Ein Admin schaut zu: Handys bitten, Messwerte zu senden (verlängert sich beim Abruf). */
  watch() {
    const now = this.deps.now();
    if (this.debugUntil !== null && this.debugUntil - now > 5000) return;
    this.debugUntil = now + 10_000;
    this.changed();
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      phase: this.phase,
      players: this.players.size,
      connected: this.connectedCount,
      createdAt: this.createdAt,
      preset: this.presetRef,
    };
  }

  /** Alles für den Admin – einschließlich Geheimem (Rollen, Spick-Wahl, Stimmen). */
  debugView(): RoomDebug {
    const m = this.match;
    return {
      serverTime: this.deps.now(),
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      preset: this.presetRef,
      config: this.config,
      timeline: m?.timeline ?? null,
      players: this.seating.map((id) => {
        const p = this.players.get(id) as Player;
        return {
          id,
          name: p.name,
          connected: p.connected,
          lastSeenAt: p.lastSeenAt,
          hatched: [...(this.hatched.get(id)?.keys() ?? [])],
          role: m?.roles[id] ?? null,
          peekChoice: m?.peekChoices[id] ?? null,
          vote: m?.votes[id] ?? null,
          calibration: this.calibrations.get(id) ?? null,
          levels: this.levels.get(id) ?? null,
          chick: m?.reports[id] ?? null,
          stations: Object.values(m?.stations[id] ?? {})
            .sort((a, b) => a.round - b.round)
            .map((st) => ({
              round: st.round,
              loss: st.loss,
              wellbeingEnd: st.wellbeingEnd,
              died: st.died,
            })),
        };
      }),
      result: m?.result ?? null,
      log: [...this.events],
    };
  }

  // --- Ausbrüten -------------------------------------------------------------

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
    if (!done.has(kind)) {
      const name = this.players.get(playerId)?.name ?? playerId;
      this.log(
        'hatch',
        `${name}: ${CARE_DE[kind]} geschafft (${method === 'sensor' ? 'Sensor' : 'Ersatz'})`,
        playerId,
      );
    }
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
   * dann Spick-Wahl. Rollen, Charaktere und Küken-Seeds entstehen hier – nur auf dem Server.
   */
  private hatchAll() {
    const t = this.config.timing;
    const now = this.deps.now();
    const at = now + t.nextLeadMs;
    const revealEndsAt = at + this.config.hatching.hatchAnimationMs + t.roleRevealMs;
    const seed = randomInt(2 ** 31);
    const rng = createRng(seed);
    const roles = assignRoles(this.seating, this.config, rng);
    const characters = Object.fromEntries(
      this.seating.map((id) => [id, rollCharacter(this.config, rng)]),
    );
    const chickSeeds = Object.fromEntries(this.seating.map((id) => [id, rng.int(0, 2 ** 31 - 1)]));
    const peekDeadline = revealEndsAt + (this.config.peek.enabled ? t.peekChoiceSeconds * 1000 : 0);
    this.match = {
      seed,
      hatch: { at, revealEndsAt },
      roles,
      characters,
      chickSeeds,
      peekDeadline,
      peekChoices: {},
      timeline: null,
      finishedAt: null,
      reports: {},
      stations: {},
      votes: {},
      voting: null,
      reveal: null,
      result: null,
    };
    this.phase = 'peekChoice';
    this.armRevealTimer();
    this.armPhaseTimer();
    this.changed();
  }

  /** Nach der Einblendung neu senden – ab dann ohne Rolle. */
  private armRevealTimer() {
    this.cancelRevealTimer?.();
    this.cancelRevealTimer = null;
    const hatch = this.hatch;
    if (!hatch || this.deps.now() >= hatch.revealEndsAt) return;
    this.cancelRevealTimer = this.deps.schedule(hatch.revealEndsAt, () => {
      this.cancelRevealTimer = null;
      this.changed();
    });
  }

  // --- Spick-Wahl --------------------------------------------------------------

  private roundsTotal() {
    return totalRounds(this.config, this.seating.length);
  }

  peekOptionsFor(ownerId: string): string[] {
    return peekOptions(ownerId, this.seating, this.roundsTotal(), this.config.peek.allowSelf);
  }

  choosePeek(ownerId: string, targetId: string) {
    this.requirePhase('peekChoice');
    const m = this.match as MatchState;
    if (!this.config.peek.enabled) throw new RoomError('not_allowed', 'Spick-Station ist aus.');
    if (this.deps.now() < m.hatch.revealEndsAt) throw new RoomError('not_allowed', 'Noch nicht.');
    if (!this.peekOptionsFor(ownerId).includes(targetId)) {
      throw new RoomError('bad_message', 'Diesen Mitspieler kannst du nicht wählen.');
    }
    m.peekChoices[ownerId] = targetId;
    this.log(
      'peek',
      `${this.players.get(ownerId)?.name ?? ownerId} hat die Spick-Station gewählt`,
      ownerId,
    );
    if (this.seating.every((id) => m.peekChoices[id] || this.peekOptionsFor(id).length === 0)) {
      this.finishPeek();
    } else {
      this.changed();
    }
  }

  /** Spick-Wahl abschließen (fehlende zufällig) und den Rundentakt starten. */
  private finishPeek() {
    const m = this.match as MatchState;
    const now = this.deps.now();
    if (now < m.hatch.revealEndsAt) {
      // Nicht vor dem Ende der Rollen-Einblendung.
      m.peekDeadline = m.hatch.revealEndsAt;
      this.armPhaseTimer();
      return;
    }
    if (this.config.peek.enabled) {
      const rng = createRng(m.seed + 1);
      for (const owner of this.seating) {
        const options = this.peekOptionsFor(owner);
        if (!m.peekChoices[owner] && options.length) m.peekChoices[owner] = rng.pick(options);
      }
    }
    const t = this.config.timing;
    m.timeline = createTimeline({
      startsAt: now + Math.max(this.config.hatching.settleMs, t.nextLeadMs),
      stationMs: t.stationSeconds * 1000,
      handoverMs: t.handoverSeconds * 1000,
      rounds: this.roundsTotal(),
    });
    this.phase = 'rounds';
    this.cancelPhaseTimer?.();
    this.cancelPhaseTimer = null;
    this.armTimer();
    this.changed();
  }

  /** Frist der Spick-Wahl überwachen. */
  private armPhaseTimer() {
    this.cancelPhaseTimer?.();
    this.cancelPhaseTimer = null;
    if (this.phase !== 'peekChoice' || !this.match) return;
    this.cancelPhaseTimer = this.deps.schedule(this.match.peekDeadline, () => {
      this.cancelPhaseTimer = null;
      if (this.phase === 'peekChoice') this.finishPeek();
    });
  }

  // --- Runden ------------------------------------------------------------------

  /** Timer auf die nächste Takt-Grenze; am Ende → Heimkehr. */
  private armTimer() {
    this.cancelTimer?.();
    this.cancelTimer = null;
    const m = this.match;
    if (this.phase !== 'rounds' || !m?.timeline) return;
    const now = this.deps.now();
    if (positionAt(m.timeline, now).stage === 'done') {
      this.phase = 'homecoming';
      m.finishedAt = now;
      this.changed();
      return;
    }
    const at = nextBoundary(m.timeline, now);
    if (at !== null) this.cancelTimer = this.deps.schedule(at, () => this.armTimer());
  }

  /** Laufender Stand vom Handy des Eigentümers (nur das eigene Küken). */
  reportChick(ownerId: string, report: ChickReport) {
    const m = this.match;
    if (!m || !MATCH_PHASES.includes(this.phase)) return;
    const prev = m.reports[ownerId];
    if (prev && prev.at > report.at) return;
    m.reports[ownerId] = report;
    // Kein Senden an alle: Der Stand ist erst ab der Heimkehr öffentlich (Admin-Debug folgt in M6).
  }

  /** Statistik einer abgeschlossenen Station; die Aufzeichnung bleibt nur für die Spick-Station. */
  recordStation(ownerId: string, stats: StationStats) {
    const m = this.match;
    if (!m || !MATCH_PHASES.includes(this.phase) || this.phase === 'peekChoice') {
      throw new RoomError('not_allowed', 'Gerade nicht möglich.');
    }
    if (stats.round >= this.roundsTotal()) throw new RoomError('bad_message', 'Unbekannte Runde.');
    const target = m.peekChoices[ownerId];
    const peek = target ? peekRound(ownerId, target, this.seating, this.roundsTotal()) : null;
    const kept = stats.round === peek ? stats : { ...stats, samples: [] };
    const byRound = (m.stations[ownerId] ??= {});
    if (!byRound[String(stats.round)]) {
      this.log(
        'station',
        `Küken von ${this.players.get(ownerId)?.name ?? ownerId}, Runde ${stats.round + 1}: Verlust ${Math.round(stats.loss * 100)} %, Befinden ${Math.round(stats.wellbeingEnd * 100)} %${stats.died ? ', gestorben' : ''}`,
        ownerId,
      );
    }
    byRound[String(stats.round)] = kept;
    this.changed();
  }

  /** Endstand eines Kükens: letzte Meldung oder letzte Station. */
  private chickOutcome(ownerId: string): ChickOutcome {
    const m = this.match as MatchState;
    const report = m.reports[ownerId];
    const stations = Object.values(m.stations[ownerId] ?? {}).sort((a, b) => b.round - a.round);
    const last = stations[0];
    if (last && (!report || report.round === null || report.round <= last.round)) {
      return { wellbeing: last.wellbeingEnd, alive: !stations.some((s) => s.died) };
    }
    if (report) return { wellbeing: report.wellbeing, alive: report.alive };
    return { wellbeing: 1, alive: true };
  }

  private chickOutcomes(): Record<string, ChickOutcome> {
    return Object.fromEntries(this.seating.map((id) => [id, this.chickOutcome(id)]));
  }

  // --- Heimkehr, Abstimmung, Enthüllung ----------------------------------------------

  private storyFor(ownerId: string) {
    const m = this.match as MatchState;
    const stations = Object.values(m.stations[ownerId] ?? {}).sort((a, b) => a.round - b.round);
    const character = m.characters[ownerId] ?? { likes: [], dislikes: [] };
    const hints = generateHints(
      stations,
      character,
      this.config,
      createRng((m.chickSeeds[ownerId] ?? 0) + 7),
    );
    const targetId = m.peekChoices[ownerId];
    const round = targetId ? peekRound(ownerId, targetId, this.seating, this.roundsTotal()) : null;
    const stats = round === null ? undefined : m.stations[ownerId]?.[String(round)];
    return { hints, peek: targetId && stats ? { targetId, stats } : null };
  }

  private startVoting() {
    this.requirePhase('homecoming');
    const m = this.match as MatchState;
    if (!Object.values(m.roles).includes('cuckoo')) return this.doReveal(null, 'no_cuckoo');
    m.votes = {};
    m.voting = { candidates: [...this.seating], runoff: 0 };
    this.phase = 'voting';
    this.changed();
  }

  castVote(voterId: string, targetId: string | null) {
    this.requirePhase('voting');
    const m = this.match as MatchState;
    if (targetId === null) {
      delete m.votes[voterId];
    } else {
      if (!m.voting?.candidates.includes(targetId)) {
        throw new RoomError('bad_message', 'Nicht wählbar.');
      }
      if (targetId === voterId) throw new RoomError('not_allowed', 'Nicht für dich selbst.');
      m.votes[voterId] = targetId;
      this.log('vote', `${this.players.get(voterId)?.name ?? voterId} hat abgestimmt`, voterId);
    }
    this.changed();
  }

  private closeVoting() {
    this.requirePhase('voting');
    const m = this.match as MatchState;
    const voting = m.voting as NonNullable<MatchState['voting']>;
    const outcome = decideVote(tallyVotes(m.votes, voting.candidates), voting.runoff, this.config);
    if (outcome.kind === 'runoff') {
      this.log('vote', `Gleichstand – Stichwahl ${voting.runoff + 1}`);
      m.votes = {};
      m.voting = { candidates: outcome.candidates, runoff: voting.runoff + 1 };
      this.changed();
      return;
    }
    this.doReveal(
      outcome.kind === 'accused' ? outcome.playerId : null,
      outcome.kind === 'nobody' ? outcome.reason : null,
    );
  }

  /** Enthüllung zu einem gemeinsamen Zeitpunkt, dazu die Wertung mit allen Rollen. */
  private doReveal(accusedId: string | null, reason: 'no_votes' | 'tie' | 'no_cuckoo' | null) {
    const m = this.match as MatchState;
    m.reveal = {
      at: this.deps.now() + this.config.timing.nextLeadMs,
      accusedId,
      accusedRole: accusedId ? (m.roles[accusedId] ?? null) : null,
      reason,
    };
    m.result = scoreGame({
      roles: m.roles,
      chicks: this.chickOutcomes(),
      accusedId,
      config: this.config,
    });
    m.voting = null;
    this.phase = 'reveal';
    this.changed();
  }

  // --- Steuerung ---------------------------------------------------------------

  control(by: string, action: GameControl) {
    this.requireHost(by);
    this.log('control', `Host: ${action}`, by);
    switch (action) {
      case 'abort':
        return this.backToLobby();
      case 'hatchNow':
        this.requirePhase('hatching');
        return this.hatchAll();
      case 'peekNow':
        this.requirePhase('peekChoice');
        return this.finishPeek();
      case 'startVoting':
        return this.startVoting();
      case 'closeVoting':
        return this.closeVoting();
    }
    this.requirePhase('rounds');
    const m = this.match as MatchState;
    const tl = m.timeline as Timeline;
    const now = this.deps.now();
    const lead = this.config.timing.nextLeadMs;
    const next =
      action === 'pause'
        ? pauseTimeline(tl, now)
        : action === 'resume'
          ? resumeTimeline(tl, now + lead)
          : skipStage(tl, now, lead);
    if (next === tl) return;
    m.timeline = next;
    this.armTimer();
    this.changed();
  }

  private resetGame() {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.cancelRevealTimer?.();
    this.cancelRevealTimer = null;
    this.cancelPhaseTimer?.();
    this.cancelPhaseTimer = null;
    this.hatched.clear();
    this.match = null;
  }

  private backToLobby() {
    this.resetGame();
    this.phase = 'lobby';
    // Wer während der Partie gegangen ist, verliert jetzt seinen Platz nach der Gnadenfrist.
    for (const p of this.players.values()) if (!p.connected) this.scheduleRemoval(p);
    this.changed();
  }

  dispose() {
    this.cancelTimer?.();
    this.cancelRevealTimer?.();
    this.cancelPhaseTimer?.();
    for (const cancel of this.removalTimers.values()) cancel();
    this.removalTimers.clear();
  }

  // --- Ansichten & Speichern ---------------------------------------------------

  viewFor(playerId: string): RoomView {
    const m = this.match;
    const phase = this.phase;
    return {
      code: this.code,
      phase,
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
      timeline: m?.timeline ?? null,
      hatch: m?.hatch ?? null,
      peek:
        m && phase === 'peekChoice'
          ? { deadline: m.peekDeadline, chosenCount: Object.keys(m.peekChoices).length }
          : null,
      chicks: m && PUBLIC_CHICK_PHASES.includes(phase) ? this.chickOutcomes() : null,
      voting:
        m?.voting && phase === 'voting'
          ? {
              candidates: m.voting.candidates,
              counts: tallyVotes(m.votes, m.voting.candidates),
              votedCount: Object.keys(m.votes).length,
              runoff: m.voting.runoff,
            }
          : null,
      reveal: phase === 'reveal' ? (m?.reveal ?? null) : null,
      result: phase === 'reveal' ? (m?.result ?? null) : null,
      preset: this.presetRef,
      debugUntil:
        this.debugUntil !== null && this.debugUntil > this.deps.now() ? this.debugUntil : null,
      you: { playerId, ...this.secretsFor(playerId) },
    };
  }

  /** Geheimes nur für diesen Spieler. */
  private secretsFor(playerId: string): Partial<RoomView['you']> {
    const m = this.match;
    if (!m) return {};
    const out: Partial<RoomView['you']> = {};
    const role = m.roles[playerId];
    // Rolle nur bis zum Ende der Einblendung – danach kennt das Handy sie nicht mehr.
    if (role && this.deps.now() < m.hatch.revealEndsAt) out.role = role;
    if (this.config.peek.enabled) {
      out.peekOptions = this.peekOptionsFor(playerId);
      out.peekChoice = m.peekChoices[playerId] ?? null;
    }
    const character = m.characters[playerId];
    if (character) {
      out.chick = {
        character,
        seed: m.chickSeeds[playerId] ?? 0,
        reportedRounds: Object.keys(m.stations[playerId] ?? {})
          .map(Number)
          .sort((a, b) => a - b),
        last: m.reports[playerId] ?? null,
      };
    }
    if (PUBLIC_CHICK_PHASES.includes(this.phase)) out.story = this.storyFor(playerId);
    if (this.phase === 'voting') out.vote = m.votes[playerId] ?? null;
    return out;
  }

  /** Rolle eines Spielers (nur serverintern). */
  roleOf(playerId: string): Role | null {
    return this.match?.roles[playerId] ?? null;
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
      hatched: Object.fromEntries(
        [...this.hatched].map(([id, kinds]) => [id, Object.fromEntries(kinds)]),
      ),
      calibrations: Object.fromEntries(this.calibrations),
      match: this.match ? structuredClone(this.match) : null,
      presetRef: this.presetRef,
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
    for (const [id, kinds] of Object.entries(snap.hatched)) {
      room.hatched.set(id, new Map(Object.entries(kinds) as [CareKind, CareMethod][]));
    }
    for (const [id, cal] of Object.entries(snap.calibrations)) room.calibrations.set(id, cal);
    room.match = snap.match ? structuredClone(snap.match) : null;
    room.presetRef = snap.presetRef;
    room.loggedPhase = snap.phase;
    room.log('restore', 'Raum nach Neustart wiederhergestellt');
    room.armRevealTimer();
    room.armPhaseTimer();
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
    if (this.phase !== this.loggedPhase) {
      this.log('phase', `Phase: ${PHASE_DE[this.loggedPhase]} → ${PHASE_DE[this.phase]}`);
      this.loggedPhase = this.phase;
    }
    this.deps.onChange(this);
  }
}
