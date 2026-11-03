import {
  NO_CARE,
  createRng,
  cuckooBot,
  fosterBot,
  holderOf,
  positionAt,
  GOOD_FOSTER,
  SNEAKY_CUCKOO,
  type BotPolicy,
  type CareInput,
  type Rng,
  type Role,
  type RoomView,
} from '@kuckuckskind/shared';
import { GameClient } from '../net/GameClient.ts';
import type { TokenStorage } from '../net/session.ts';
import { ChickRunner, type RunnerStorage } from '../game/ChickRunner.ts';

const BOT_NAMES = ['Amsel', 'Meise', 'Fink', 'Star', 'Spatz', 'Zaunkönig', 'Rotkehlchen'];

/** Bot-Zustand (Token und Rolle) überlebt Neuladen im selben Tab. */
function sessionTokenStorage(key: string): TokenStorage {
  const safe = <T>(fn: () => T, fb: T) => {
    try {
      return fn();
    } catch {
      return fb;
    }
  };
  return {
    get: () => safe(() => sessionStorage.getItem(key), null),
    set: (t) => safe(() => sessionStorage.setItem(key, t), undefined),
    clear: () => safe(() => sessionStorage.removeItem(key), undefined),
  };
}

const localRunnerStorage: RunnerStorage = {
  load: (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null');
    } catch {
      return null;
    }
  },
  save: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // egal
    }
  },
};

interface Bot {
  index: number;
  name: string;
  client: GameClient;
  role: Role | null;
  runner: ChickRunner | null;
  runnerKey: string | null;
  /** Geplante Aktionen je Phase (damit jede nur einmal passiert). */
  done: Set<string>;
}

/**
 * Bot-Modus für die Entwicklung (`?bots=N`): simulierte Mitspieler im selben Browser, damit
 * sich eine Partie mit einem einzigen Gerät durchspielen lässt.
 *
 * - Jeder Bot hat eine eigene WebSocket-Verbindung und ein eigenes Küken (eigener Runner).
 * - Das echte Gerät spielt alle Stationen, die sein Spieler am Tisch hätte: In Runde r zeigt es
 *   das Küken, das dieser Spieler gerade halten würde, und die eigenen Sensoren pflegen es.
 * - Wer ein Küken hält, das ein Bot hält, pflegt es nach der Bot-Strategie aus /shared
 *   (gute Pflegeeltern; der Kuckucks-Bot sabotiert leise).
 * - Bots brüten per Ersatz aus, wählen ihre Spick-Station zufällig und stimmen zufällig ab.
 *
 * Nur zum Testen: Die Bots kennen ihre eigenen Rollen im Speicher dieses Browsers.
 */
export class BotManager {
  readonly bots: Bot[] = [];
  private humanRunner: ChickRunner | null = null;
  private policies = new Map<string, BotPolicy>();
  private readonly rng: Rng = createRng(Date.now() % 2 ** 31);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    readonly count: number,
    private readonly wsUrl: string,
    private readonly human: GameClient,
  ) {
    for (let i = 0; i < count; i++) {
      const name = `Bot ${BOT_NAMES[i % BOT_NAMES.length]}${i >= BOT_NAMES.length ? ` ${i + 1}` : ''}`;
      const client = new GameClient({
        url: wsUrl,
        storage: sessionTokenStorage(`kuckuck.bot.${i}`),
        device: `Bot ${i + 1}`,
      });
      const bot: Bot = {
        index: i,
        name,
        client,
        role: this.loadRole(i),
        runner: null,
        runnerKey: null,
        done: new Set(),
      };
      client.subscribe(() => this.onBotState(bot));
      this.bots.push(bot);
      client.start();
    }
    human.subscribe(() => this.onHumanState());
    this.timer = setInterval(() => this.tick(), 100);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  isBot(playerId: string): boolean {
    return this.bots.some((b) => b.client.getState().room?.you.playerId === playerId);
  }

  private botById(playerId: string): Bot | undefined {
    return this.bots.find((b) => b.client.getState().room?.you.playerId === playerId);
  }

  /** Runner des Kükens, das dem Spieler `ownerId` gehört (eigenes oder eines Bots). */
  runnerOf(ownerId: string): ChickRunner | null {
    const bot = this.botById(ownerId);
    return bot ? bot.runner : null;
  }

  /** Charakter eines Bot-Kükens (für Herzchen bei Lieblingspflege). */
  characterOf(ownerId: string) {
    return this.botById(ownerId)?.client.getState().room?.you.chick?.character ?? null;
  }

  /** Der echte Spieler-Runner (von ChickRunnerHost gemeldet). */
  setHumanRunner(runner: ChickRunner | null) {
    this.humanRunner = runner;
  }

  // --- Verhalten --------------------------------------------------------------

  private onHumanState() {
    const room = this.human.getState().room;
    if (!room || room.phase !== 'lobby') return;
    // Bots treten bei, sobald der echte Spieler einen Raum hat.
    for (const bot of this.bots) {
      const botRoom = bot.client.getState().room;
      if (botRoom?.code === room.code) continue;
      if (bot.client.getState().status !== 'open') continue;
      const key = `join:${room.code}`;
      if (bot.done.has(key)) continue;
      bot.done.add(key);
      setTimeout(() => bot.client.joinRoom(room.code, bot.name), 200 + bot.index * 150);
    }
  }

  private later(bot: Bot, key: string, minMs: number, maxMs: number, fn: () => void) {
    if (bot.done.has(key)) return;
    bot.done.add(key);
    setTimeout(fn, minMs + this.rng.next() * (maxMs - minMs));
  }

  private onBotState(bot: Bot) {
    const room = bot.client.getState().room;
    if (bot.client.getState().status === 'open') this.onHumanState();
    if (!room) return;
    const gameKey = room.hatch?.at ?? 'none';
    if (room.you.role && bot.role !== room.you.role) {
      bot.role = room.you.role;
      this.saveRole(bot.index, bot.role);
    }

    switch (room.phase) {
      case 'lobby':
        bot.done.forEach((k) => k.startsWith('game:') && bot.done.delete(k));
        this.policies.clear();
        break;
      case 'hatching': {
        const me = room.players.find((p) => p.id === room.you.playerId);
        const missing = room.config.care.activeKinds.filter((k) => !me?.hatched.includes(k));
        missing.forEach((kind, i) =>
          this.later(bot, `game:hatch:${kind}:${room.code}`, 800 + i * 900, 2500 + i * 900, () =>
            bot.client.hatchProgress(kind, 'fallback'),
          ),
        );
        break;
      }
      case 'peekChoice': {
        const options = room.you.peekOptions ?? [];
        if (!room.hatch || !options.length || room.you.peekChoice) break;
        const wait = Math.max(0, room.hatch.revealEndsAt - bot.client.serverNow());
        this.later(bot, `game:peek:${gameKey}`, wait + 500, wait + 3000, () =>
          bot.client.choosePeek(this.rng.pick(options)),
        );
        break;
      }
      case 'voting': {
        const v = room.voting;
        if (!v) break;
        const options = v.candidates.filter((id) => id !== room.you.playerId);
        if (!options.length) break;
        this.later(bot, `game:vote:${gameKey}:${v.runoff}`, 1500, 5000, () => {
          // Kuckuck lenkt ab: wählt nie sich selbst (geht ohnehin nicht) – sonst zufällig.
          bot.client.vote(this.rng.pick(options));
        });
        break;
      }
    }
    this.ensureRunner(bot, room);
    this.changed();
  }

  private ensureRunner(bot: Bot, room: RoomView) {
    const chick = room.you.chick;
    const key =
      chick && room.timeline && room.hatch
        ? `kuckuck.chick.${room.code}.${room.you.playerId}.${room.hatch.at}`
        : null;
    if (key === bot.runnerKey) {
      if (bot.runner && room.timeline) bot.runner.setTimeline(room.timeline);
      return;
    }
    bot.runnerKey = key;
    bot.runner =
      key && chick && room.timeline
        ? new ChickRunner(
            key,
            room.config,
            chick.character,
            chick.seed,
            room.timeline,
            localRunnerStorage,
            {
              report: (r) => bot.client.reportChick(r),
              station: (s) => bot.client.sendStation(s),
            },
            chick.last,
          )
        : null;
  }

  /** Pflege durch einen Bot-Halter (eine Strategie-Instanz je Station). */
  private policyInput(
    holderId: string,
    ownerId: string,
    round: number,
    runner: ChickRunner,
    t: number,
    room: RoomView,
  ): CareInput {
    const key = `${holderId}:${ownerId}:${round}`;
    let policy = this.policies.get(key);
    if (!policy) {
      const role = this.botById(holderId)?.role ?? 'foster';
      policy = role === 'cuckoo' ? cuckooBot(SNEAKY_CUCKOO, this.rng) : fosterBot(GOOD_FOSTER);
      this.policies.set(key, policy);
    }
    return policy({ state: runner.getView().state, config: room.config, t, rng: this.rng });
  }

  private tick() {
    const room = this.human.getState().room;
    const tl = room?.timeline;
    if (!room || !tl) return;
    const now = this.human.serverNow();
    const wall = performance.now();
    const pos = positionAt(tl, now);
    const seating = room.players.map((p) => p.id);
    const humanId = room.you.playerId;
    const station = pos.stage === 'station' && !pos.paused ? pos : null;
    const t = station ? now - station.startsAt : 0;

    // Eigenes Küken: hält es gerade ein Bot, pflegt der Bot.
    if (this.humanRunner && station) {
      const holder = holderOf(humanId, station.round, seating);
      if (holder !== humanId) {
        this.humanRunner.setInput(
          this.policyInput(holder, humanId, station.round, this.humanRunner, t, room),
        );
      }
    }
    // Bot-Küken: hält es der Mensch, kommt die Pflege von den Sensoren (Station-Bildschirm).
    for (const bot of this.bots) {
      const botRoom = bot.client.getState().room;
      if (!bot.runner || !botRoom) continue;
      const owner = botRoom.you.playerId;
      if (station) {
        const holder = holderOf(owner, station.round, seating);
        if (holder !== humanId)
          bot.runner.setInput(this.policyInput(holder, owner, station.round, bot.runner, t, room));
      } else {
        bot.runner.setInput(NO_CARE);
      }
      bot.runner.advance(bot.client.serverNow(), wall);
      if (botRoom.you.chick) bot.runner.resendMissing(botRoom.you.chick.reportedRounds);
    }
  }

  private loadRole(i: number): Role | null {
    try {
      return (sessionStorage.getItem(`kuckuck.bot.${i}.role`) as Role | null) ?? null;
    } catch {
      return null;
    }
  }

  private saveRole(i: number, role: Role) {
    try {
      sessionStorage.setItem(`kuckuck.bot.${i}.role`, role);
    } catch {
      // egal
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    for (const b of this.bots) b.client.stop();
  }
}
