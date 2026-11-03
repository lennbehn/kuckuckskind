import { GravityFilter, magnitude, type SensorStatus } from '@kuckuckskind/shared';

type PermissionRequester = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Freigabe des Bewegungssensors. Auf iOS MUSS das direkt aus einem Antippen heraus
 * aufgerufen werden (erster `await` in einem Klick-Handler).
 */
export async function requestMotionPermission(): Promise<SensorStatus> {
  if (typeof window.DeviceMotionEvent === 'undefined') return 'unavailable';
  if (!window.isSecureContext) return 'insecure';
  const req = (window.DeviceMotionEvent as unknown as PermissionRequester).requestPermission;
  if (typeof req === 'function') {
    try {
      return (await req()) === 'granted' ? 'ok' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'ok';
}

export type MotionListener = (t: number, magnitude: number) => void;

/** Beschleunigung ohne Schwerkraft (Betrag in m/s²). */
export class MotionSource {
  private readonly listeners = new Set<MotionListener>();
  private readonly gravity = new GravityFilter(0.9);
  private gotData = false;

  constructor() {
    window.addEventListener('devicemotion', this.onMotion);
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    let m: number;
    if (a && a.x !== null) m = magnitude(a);
    else if (g && g.x !== null) m = magnitude(this.gravity.push(g));
    else return;
    this.gotData = true;
    const t = performance.now();
    for (const fn of this.listeners) fn(t, m);
  };

  /** Liefert das Gerät überhaupt Werte? (Desktop-Browser haben oft das Event, aber keine Daten.) */
  waitForData(timeoutMs = 1500): Promise<boolean> {
    if (this.gotData) return Promise.resolve(true);
    return new Promise((resolve) => {
      const unsub = this.subscribe(() => {
        unsub();
        clearTimeout(timer);
        resolve(true);
      });
      const timer = setTimeout(() => {
        unsub();
        resolve(false);
      }, timeoutMs);
    });
  }

  subscribe(fn: MotionListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  stop() {
    window.removeEventListener('devicemotion', this.onMotion);
  }
}
