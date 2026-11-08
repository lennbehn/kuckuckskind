/**
 * Erkennung der Pflegearten aus Sensor-Messwerten – reine Funktionen/Klassen ohne
 * Browser-APIs, damit sie testbar sind und Bots sie nutzen können.
 * Der Browser liefert nur Messwerte (Pegel in dB, Beschleunigung, Touchpunkte).
 */

// ---------------------------------------------------------------------------
// Mikrofon
// ---------------------------------------------------------------------------

/** Untergrenze für Pegel (Stille / kein Signal). */
export const MIN_DB = -100;

/** RMS eines Audio-Blocks (Werte −1…1) in dBFS. */
export function rmsDb(samples: ArrayLike<number>): number {
  if (samples.length === 0) return MIN_DB;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] as number;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(MIN_DB, 20 * Math.log10(rms)) : MIN_DB;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Ruhepegel: Median der Messungen während einer stillen Phase. */
export class NoiseFloor {
  private values: number[] = [];
  push(db: number) {
    this.values.push(db);
  }
  get count() {
    return this.values.length;
  }
  result(): number | null {
    return median(this.values);
  }
}

export interface BlowConfig {
  thresholdOverNoiseDb: number;
  minDurationMs: number;
}

export interface BlowState {
  db: number;
  /** Pegel über der Schwelle. */
  blowing: boolean;
  /** Dauer des aktuellen Pustens. */
  blowMs: number;
  /** Lautester Pegel bisher. */
  peakDb: number;
  /** Lange genug gepustet (einmalig true, bis `reset`). */
  completed: boolean;
}

/** Pusten = Pegel mindestens `minDurationMs` lang über Ruhepegel + Schwelle. */
export class BlowDetector {
  private startedAt: number | null = null;
  private peak = MIN_DB;
  private done = false;

  constructor(
    private readonly cfg: BlowConfig,
    readonly noiseDb: number,
  ) {}

  get thresholdDb() {
    return this.noiseDb + this.cfg.thresholdOverNoiseDb;
  }

  push(t: number, db: number): BlowState {
    this.peak = Math.max(this.peak, db);
    const blowing = db >= this.thresholdDb;
    if (blowing) this.startedAt ??= t;
    else this.startedAt = null;
    const blowMs = this.startedAt === null ? 0 : t - this.startedAt;
    if (blowMs >= this.cfg.minDurationMs) this.done = true;
    return { db, blowing, blowMs, peakDb: this.peak, completed: this.done };
  }

  reset() {
    this.startedAt = null;
    this.done = false;
  }
}

// ---------------------------------------------------------------------------
// Bewegung
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number | null;
  y: number | null;
  z: number | null;
}

export const magnitude = (v: Vec3) => Math.hypot(v.x ?? 0, v.y ?? 0, v.z ?? 0);

/**
 * Entfernt die Schwerkraft aus `accelerationIncludingGravity`, falls ein Gerät keine
 * reine `acceleration` liefert (Hochpass über gleitenden Mittelwert).
 */
export class GravityFilter {
  private g: { x: number; y: number; z: number } | null = null;
  constructor(private readonly alpha = 0.9) {}
  push(v: Vec3): Vec3 {
    const x = v.x ?? 0;
    const y = v.y ?? 0;
    const z = v.z ?? 0;
    this.g = this.g
      ? {
          x: this.alpha * this.g.x + (1 - this.alpha) * x,
          y: this.alpha * this.g.y + (1 - this.alpha) * y,
          z: this.alpha * this.g.z + (1 - this.alpha) * z,
        }
      : { x, y, z };
    return { x: x - this.g.x, y: y - this.g.y, z: z - this.g.z };
  }
}

export interface RockConfig {
  gentleMin: number;
  gentleMax: number;
  harshAbove: number;
  smoothingMs: number;
}

export type RockZone = 'still' | 'gentle' | 'between' | 'harsh';

export interface RockState {
  /** Geglättete, mit der Geräte-Empfindlichkeit skalierte Bewegung (m/s²). */
  level: number;
  zone: RockZone;
  /** Summe der Zeit im sanften Band seit `reset`. */
  gentleMs: number;
  /** Summe der Zeit im zu wilden Bereich seit `reset`. */
  harshMs: number;
}

export function rockZone(level: number, cfg: RockConfig): RockZone {
  if (level >= cfg.harshAbove) return 'harsh';
  if (level > cfg.gentleMax) return 'between';
  if (level >= cfg.gentleMin) return 'gentle';
  return 'still';
}

/** Wiegen: geglättete Beschleunigung im sanften Band; zu wild schadet. */
export class RockDetector {
  private level = 0;
  private lastT: number | null = null;
  private gentle = 0;
  private harsh = 0;

  constructor(
    private readonly cfg: RockConfig,
    /** Geräte-Empfindlichkeit aus der Kalibrierung (1 = unverändert). */
    readonly scale = 1,
  ) {}

  push(t: number, rawMagnitude: number): RockState {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(t - this.lastT, 500));
    this.lastT = t;
    const value = rawMagnitude * this.scale;
    // Exponentielle Glättung mit Zeitkonstante smoothingMs.
    const a = this.cfg.smoothingMs > 0 ? 1 - Math.exp(-dt / this.cfg.smoothingMs) : 1;
    this.level += a * (value - this.level);
    const zone = rockZone(this.level, this.cfg);
    if (zone === 'gentle') this.gentle += dt;
    if (zone === 'harsh') this.harsh += dt;
    return { level: this.level, zone, gentleMs: this.gentle, harshMs: this.harsh };
  }

  reset() {
    this.gentle = 0;
    this.harsh = 0;
  }
}

/**
 * Bestimmt die Empfindlichkeit eines Geräts: Wie stark bewegt diese Person dieses Handy,
 * wenn sie „sanft wiegt“? Der Median der Bewegung wird auf die Mitte des sanften Bands gelegt.
 */
export class RockCalibrator {
  private values: number[] = [];
  private movingMs = 0;
  private lastT: number | null = null;

  constructor(
    private readonly cfg: RockConfig & { scaleMin: number; scaleMax: number },
    /** Bewegungen darunter zählen nicht (Handy liegt still). */
    private readonly minMotion = 0.3,
  ) {}

  push(t: number, smoothedUnscaled: number) {
    const dt = this.lastT === null ? 0 : Math.min(t - this.lastT, 500);
    this.lastT = t;
    if (smoothedUnscaled < this.minMotion) return;
    this.values.push(smoothedUnscaled);
    this.movingMs += dt;
  }

  /** Wie lange sich das Gerät während der Messung bewegt hat. */
  get measuredMs() {
    return this.movingMs;
  }

  scale(): number {
    const m = median(this.values);
    if (m === null || m <= 0) return 1;
    const mid = (this.cfg.gentleMin + this.cfg.gentleMax) / 2;
    return Math.min(this.cfg.scaleMax, Math.max(this.cfg.scaleMin, mid / m));
  }
}

// ---------------------------------------------------------------------------
// Zudecken
// ---------------------------------------------------------------------------

export interface TouchPoint {
  /** Kontakt-Radius in px (radiusX/radiusY, 0 wenn unbekannt). */
  radius: number;
}

export interface CoverConfig {
  minTouchPoints: number;
  minContactRadiusPx: number;
  holdMs: number;
}

export type CoverMethod = 'touches' | 'area';

export interface CoverState {
  covered: boolean;
  method: CoverMethod | null;
  heldMs: number;
  completed: boolean;
  /** Meiste gleichzeitige Touchpunkte bisher (für Kalibrierung/Debug). */
  maxTouches: number;
}

/** Zudecken = viele Finger gleichzeitig oder eine große Kontaktfläche, `holdMs` lang. */
export class CoverDetector {
  private since: number | null = null;
  private done = false;
  private maxTouches = 0;

  constructor(private readonly cfg: CoverConfig) {}

  update(t: number, touches: readonly TouchPoint[]): CoverState {
    this.maxTouches = Math.max(this.maxTouches, touches.length);
    const method: CoverMethod | null =
      touches.length >= this.cfg.minTouchPoints
        ? 'touches'
        : this.cfg.minContactRadiusPx > 0 &&
            touches.some((p) => p.radius >= this.cfg.minContactRadiusPx)
          ? 'area'
          : null;
    const covered = method !== null;
    if (covered) this.since ??= t;
    else this.since = null;
    const heldMs = this.since === null ? 0 : t - this.since;
    if (heldMs >= this.cfg.holdMs) this.done = true;
    return { covered, method, heldMs, completed: this.done, maxTouches: this.maxTouches };
  }

  reset() {
    this.since = null;
    this.done = false;
  }
}
