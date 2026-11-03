import type { DeviceCalibration, SensorStatus } from '@kuckuckskind/shared';
import { MicLevel, openMic } from './mic.ts';
import { MotionSource, requestMotionPermission } from './motion.ts';
import { detectPlatform, isStandalone } from './platform.ts';
import { WakeLock } from './wakeLock.ts';

const STORAGE_KEY = 'kuckuck.calibration';

/** Gerätespezifische Werte, die die Kalibrierung ergibt (überlebt Neuladen). */
export interface StoredCalibration {
  noiseDb?: number;
  peakDb?: number;
  rockScale?: number;
  coverMinTouchPoints?: number;
  coverMaxTouches?: number;
  coverMethod?: 'touches' | 'area' | 'fallback';
}

export interface SensorsState {
  enabled: boolean;
  enabling: boolean;
  mic: SensorStatus;
  motion: SensorStatus;
  wakeLock: boolean;
  wakeLockSupported: boolean;
  stored: StoredCalibration;
}

function loadStored(): StoredCalibration {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredCalibration;
  } catch {
    return {};
  }
}

/**
 * Alle Sensoren eines Geräts an einer Stelle: Freigaben, Status, Kalibrierwerte.
 * `enable()` muss aus einem Antippen heraus aufgerufen werden (iOS-Freigaben, Audio).
 */
export class DeviceSensors {
  mic: MicLevel | null = null;
  motion: MotionSource | null = null;
  readonly wakeLock = new WakeLock();
  readonly platform = detectPlatform();
  private readonly listeners = new Set<() => void>();
  private state: SensorsState = {
    enabled: false,
    enabling: false,
    mic: 'unused',
    motion: 'unused',
    wakeLock: false,
    wakeLockSupported: this.wakeLock.supported,
    stored: loadStored(),
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<SensorsState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Freigaben holen. Reihenfolge wichtig: alles, was eine Nutzergeste braucht, zuerst. */
  async enable(): Promise<void> {
    if (this.state.enabled || this.state.enabling) return;
    this.set({ enabling: true });
    // AudioContext synchron im Klick erzeugen, sonst bleibt er auf iOS stumm.
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = AudioCtx ? new AudioCtx() : null;
    const motionPermission = requestMotionPermission();
    const wake = this.wakeLock.request();

    let motion = await motionPermission;
    if (motion === 'ok') {
      this.motion = new MotionSource();
      if (!(await this.motion.waitForData())) {
        this.motion.stop();
        this.motion = null;
        motion = 'unavailable';
      }
    }
    let mic: SensorStatus = 'unavailable';
    if (ctx) {
      const result = await openMic(ctx);
      mic = result.status;
      this.mic = result.mic ?? null;
    }
    this.set({ enabled: true, enabling: false, mic, motion, wakeLock: await wake });
  }

  async reacquireWakeLock() {
    await this.wakeLock.reacquire();
    if (this.state.enabled) this.set({ wakeLock: this.wakeLock.active });
  }

  /** Kalibrierwerte merken (lokal) – `calibration()` liefert sie für den Server. */
  store(patch: StoredCalibration) {
    const stored = { ...this.state.stored, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Ohne Speicher gilt die Kalibrierung nur bis zum Neuladen.
    }
    this.set({ stored });
  }

  calibration(): DeviceCalibration {
    const { mic, motion, stored, wakeLock } = this.state;
    return {
      platform: this.platform,
      standalone: isStandalone(),
      wakeLock,
      mic: { status: mic, noiseDb: stored.noiseDb, peakDb: stored.peakDb },
      motion: { status: motion, scale: stored.rockScale },
      cover: {
        minTouchPoints: stored.coverMinTouchPoints,
        maxTouches: stored.coverMaxTouches,
        method: stored.coverMethod,
      },
    };
  }
}
