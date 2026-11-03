import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  clockSample,
  estimateClockOffset,
  parseServerMessage,
  type ClientMessage,
  type CareKind,
  type CareMethod,
  type ChickReport,
  type ClockSample,
  type DeviceCalibration,
  type ErrorCode,
  type GameControl,
  type HostSettings,
  type RoomView,
  type StationStats,
} from '@kuckuckskind/shared';
import type { TokenStorage } from './session.ts';

export type ConnectionStatus =
  /** Erste Verbindung läuft. */
  | 'connecting'
  /** Verbunden und begrüßt. */
  | 'open'
  /** Verbindung weg, wird automatisch neu aufgebaut. */
  | 'offline'
  /** Gleiche Sitzung ist anderswo offen – kein automatisches Neuverbinden. */
  | 'replaced'
  /** Server spricht ein anderes Protokoll – Seite neu laden. */
  | 'outdated';

export interface GameState {
  status: ConnectionStatus;
  room: RoomView | null;
  clock: ClockSample | null;
  lastError: { code: ErrorCode | 'offline'; message: string; at: number } | null;
  closedReason: 'left' | 'kicked' | 'expired' | null;
}

/** Was der Client von einem WebSocket braucht (für Tests austauschbar). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface GameClientOptions {
  url: string;
  storage: TokenStorage;
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
  device?: string;
  /** Standard-Werte, bis die Raum-Konfiguration bekannt ist. */
  clockSyncIntervalMs?: number;
  clockSyncSamples?: number;
}

const OPEN = 1;
const MAX_SAMPLES = 20;

/**
 * Verbindung zum Spielserver: Handshake, Wiederverbinden mit Backoff, regelmäßiger
 * Uhrabgleich und der zuletzt bekannte Raumzustand. React liest den Zustand über
 * `subscribe`/`getState` (useSyncExternalStore).
 */
export class GameClient {
  private state: GameState = {
    status: 'connecting',
    room: null,
    clock: null,
    lastError: null,
    closedReason: null,
  };
  private readonly listeners = new Set<() => void>();
  private socket: SocketLike | null = null;
  private stopped = true;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private burstTimers: ReturnType<typeof setTimeout>[] = [];
  private samples: ClockSample[] = [];
  private readonly now: () => number;
  private readonly createSocket: (url: string) => SocketLike;

  constructor(private readonly opts: GameClientOptions) {
    this.now = opts.now ?? Date.now;
    this.createSocket = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  }

  // --- Zustand für React -------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(patch: Partial<GameState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Geschätzte Server-Zeit. */
  serverNow(): number {
    return this.now() + (this.state.clock?.offset ?? 0);
  }

  // --- Verbindung ----------------------------------------------------------------

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close(1000, 'client_stop');
    this.socket = null;
  }

  /** Sofort neu verbinden (z. B. App kommt in den Vordergrund, „Hier weiterspielen“). */
  reconnectNow() {
    if (this.stopped) return;
    if (this.socket && this.socket.readyState === OPEN && this.state.status === 'open') {
      this.syncClock();
      return;
    }
    this.attempt = 0;
    this.clearReconnect();
    this.connect();
  }

  private connect() {
    this.clearReconnect();
    const old = this.socket;
    if (old) {
      old.onclose = old.onmessage = old.onerror = old.onopen = null;
      old.close();
    }
    const socket = this.createSocket(this.opts.url);
    this.socket = socket;
    socket.onopen = () => {
      this.send({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        sessionToken: this.opts.storage.get() ?? undefined,
        device: this.opts.device,
      });
    };
    socket.onmessage = (ev) => this.onMessage(String(ev.data));
    socket.onerror = () => {};
    socket.onclose = (ev) => this.onClose(ev.code);
  }

  private onClose(code: number) {
    this.socket = null;
    this.clearSync();
    if (this.stopped) return;
    if (code === CLOSE_CODES.replaced) return this.set({ status: 'replaced' });
    if (code === CLOSE_CODES.protocolMismatch) return this.set({ status: 'outdated' });
    this.set({ status: this.state.status === 'connecting' ? 'connecting' : 'offline' });
    const delay = Math.min(5000, 500 * 2 ** this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private onMessage(raw: string) {
    const parsed = parseServerMessage(raw);
    if (!parsed.ok) return;
    const msg = parsed.message;
    switch (msg.type) {
      case 'welcome': {
        this.attempt = 0;
        this.opts.storage.set(msg.sessionToken);
        // Ohne fortgesetzte Sitzung gibt es keinen Raum mehr.
        this.set({ status: 'open', ...(msg.resumed ? {} : { room: null }) });
        this.syncClock();
        return;
      }
      case 'time.pong': {
        const sample = clockSample(
          msg.clientSentAt,
          msg.serverReceivedAt,
          msg.serverSentAt,
          this.now(),
        );
        this.samples = [...this.samples, sample].slice(-MAX_SAMPLES);
        return this.set({ clock: estimateClockOffset(this.samples) });
      }
      case 'room.state':
        return this.set({ room: msg.room, closedReason: null });
      case 'room.closed':
        return this.set({ room: null, closedReason: msg.reason });
      case 'error':
        return this.set({ lastError: { code: msg.code, message: msg.message, at: this.now() } });
      case 'module.event':
        return;
    }
  }

  private send(msg: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  /** Aktion des Spielers; ohne Verbindung gibt es eine Fehlermeldung statt stiller Verluste. */
  private act(msg: ClientMessage) {
    if (this.state.status !== 'open' || !this.send(msg)) {
      this.set({
        lastError: {
          code: 'offline',
          message: 'Keine Verbindung – gleich nochmal.',
          at: this.now(),
        },
      });
    }
  }

  // --- Uhrabgleich -------------------------------------------------------------

  /** Eine Serie von Pings, danach regelmäßig wiederholen. */
  private syncClock() {
    this.clearSync();
    const timing = this.state.room?.config.timing;
    const samples = timing?.clockSyncSamples ?? this.opts.clockSyncSamples ?? 5;
    const interval = timing?.clockSyncIntervalMs ?? this.opts.clockSyncIntervalMs ?? 10_000;
    for (let i = 0; i < samples; i++) {
      this.burstTimers.push(
        setTimeout(() => this.send({ type: 'time.ping', clientSentAt: this.now() }), i * 150),
      );
    }
    this.syncTimer = setTimeout(() => this.syncClock(), interval);
  }

  private clearSync() {
    for (const t of this.burstTimers) clearTimeout(t);
    this.burstTimers = [];
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearTimers() {
    this.clearSync();
    this.clearReconnect();
  }

  // --- Aktionen --------------------------------------------------------------------

  createRoom(name: string) {
    this.act({ type: 'room.create', name });
  }
  joinRoom(roomCode: string, name: string) {
    this.act({ type: 'room.join', roomCode, name });
  }
  leaveRoom() {
    this.act({ type: 'room.leave' });
  }
  setSeating(order: string[]) {
    this.act({ type: 'lobby.seating', order });
  }
  updateSettings(settings: HostSettings) {
    this.act({ type: 'lobby.settings', settings });
  }
  kick(playerId: string) {
    this.act({ type: 'lobby.kick', playerId });
  }
  startGame() {
    this.act({ type: 'game.start' });
  }
  control(action: GameControl) {
    this.act({ type: 'game.control', action });
  }
  hatchProgress(kind: CareKind, method: CareMethod) {
    this.act({ type: 'hatch.progress', kind, method });
  }
  /** Technik-Check melden; ohne Verbindung still verwerfen (wird später erneut gesendet). */
  sendCalibration(calibration: DeviceCalibration) {
    this.send({ type: 'device.calibration', calibration });
  }
  choosePeek(targetId: string) {
    this.act({ type: 'peek.choose', targetId });
  }
  vote(targetId: string | null) {
    this.act({ type: 'vote.cast', targetId });
  }
  /** Laufender Stand des eigenen Kükens; ohne Verbindung still verwerfen. */
  reportChick(report: ChickReport) {
    this.send({ type: 'chick.report', report });
  }
  /** Stationsstatistik; fehlt die Verbindung, sendet der Runner später erneut. */
  sendStation(stats: StationStats) {
    this.send({ type: 'chick.station', stats });
  }
  dismissError() {
    this.set({ lastError: null });
  }
}
