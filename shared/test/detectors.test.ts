import { describe, expect, it } from 'vitest';
import {
  BlowDetector,
  CoverDetector,
  GravityFilter,
  MIN_DB,
  NoiseFloor,
  RockCalibrator,
  RockDetector,
  defaultGameConfig,
  magnitude,
  median,
  rmsDb,
} from '../src/index.ts';

const { blow, rock, cover } = defaultGameConfig.sensors;

describe('Mikrofon', () => {
  it('rmsDb: Vollaussteuerung 0 dB, Stille Untergrenze', () => {
    expect(rmsDb([1, -1, 1, -1])).toBeCloseTo(0);
    expect(rmsDb([0.1, -0.1])).toBeCloseTo(-20);
    expect(rmsDb([0, 0, 0])).toBe(MIN_DB);
    expect(rmsDb([])).toBe(MIN_DB);
  });

  it('Ruhepegel ist der Median', () => {
    const n = new NoiseFloor();
    for (const v of [-60, -58, -20, -59, -61]) n.push(v);
    expect(n.result()).toBe(-59);
    expect(new NoiseFloor().result()).toBeNull();
    expect(median([1, 3])).toBe(2);
  });

  it('Pusten zählt erst nach Mindestdauer über der Schwelle', () => {
    const d = new BlowDetector(blow, -60);
    expect(d.thresholdDb).toBe(-60 + blow.thresholdOverNoiseDb);
    expect(d.push(0, -50).blowing).toBe(false);
    expect(d.push(100, -40).blowing).toBe(true);
    expect(d.push(100 + blow.minDurationMs - 1, -38).completed).toBe(false);
    const s = d.push(100 + blow.minDurationMs, -35);
    expect(s.completed).toBe(true);
    expect(s.peakDb).toBe(-35);
  });

  it('Unterbrechung setzt die Pustedauer zurück', () => {
    const d = new BlowDetector({ thresholdOverNoiseDb: 10, minDurationMs: 300 }, -60);
    d.push(0, -40);
    d.push(200, -40);
    d.push(250, -70);
    d.push(300, -40);
    expect(d.push(500, -40).completed).toBe(false);
    expect(d.push(600, -40).completed).toBe(true);
  });
});

describe('Bewegung', () => {
  it('Betrag und Schwerkraft-Filter', () => {
    expect(magnitude({ x: 3, y: 4, z: null })).toBe(5);
    const f = new GravityFilter(0.9);
    let out = { x: 0, y: 0, z: 0 } as ReturnType<GravityFilter['push']>;
    for (let i = 0; i < 200; i++) out = f.push({ x: 0, y: 0, z: 9.81 });
    expect(magnitude(out)).toBeLessThan(0.01);
  });

  /** Simuliert gleichmäßige Bewegung mit Betrag `m` über `ms` (alle 20 ms ein Wert). */
  const feed = (d: RockDetector, m: number, ms: number, t0 = 0) => {
    let s = d.push(t0, m);
    for (let t = t0 + 20; t <= t0 + ms; t += 20) s = d.push(t, m);
    return s;
  };

  it('sanftes Wiegen landet im sanften Band und summiert Zeit', () => {
    const d = new RockDetector(rock);
    const s = feed(d, 2, 3000);
    expect(s.zone).toBe('gentle');
    expect(s.gentleMs).toBeGreaterThan(2000);
    expect(s.harshMs).toBe(0);
  });

  it('wildes Schütteln wird erkannt', () => {
    const s = feed(new RockDetector(rock), 12, 3000);
    expect(s.zone).toBe('harsh');
    expect(s.harshMs).toBeGreaterThan(2000);
  });

  it('still liegendes Handy wiegt nicht', () => {
    expect(feed(new RockDetector(rock), 0.1, 3000).zone).toBe('still');
  });

  it('Empfindlichkeit skaliert die Messwerte', () => {
    expect(feed(new RockDetector(rock, 3), 2, 3000).zone).not.toBe('gentle');
    expect(feed(new RockDetector(rock, 0.5), 5, 3000).zone).toBe('gentle');
  });

  it('Kalibrierung legt die typische Bewegung in die Bandmitte', () => {
    const cfg = { ...rock, scaleMin: 0.4, scaleMax: 2.5 };
    const c = new RockCalibrator(cfg);
    for (let t = 0; t <= 2000; t += 20) c.push(t, 6);
    const scale = c.scale();
    expect(scale).toBeCloseTo((rock.gentleMin + rock.gentleMax) / 2 / 6);
    expect(c.measuredMs).toBeGreaterThan(1900);

    const tiny = new RockCalibrator(cfg);
    for (let t = 0; t <= 2000; t += 20) tiny.push(t, 0.31);
    expect(tiny.scale()).toBe(2.5);
    expect(new RockCalibrator(cfg).scale()).toBe(1);
  });
});

describe('Zudecken', () => {
  const finger = { radius: 5 };
  const palm = { radius: 60 };

  it('viele Finger lange genug = zugedeckt', () => {
    const d = new CoverDetector(cover);
    expect(cover.minTouchPoints).toBe(3);
    expect(d.update(0, [finger, finger]).covered).toBe(false);
    expect(d.update(10, Array(3).fill(finger))).toMatchObject({ covered: true, method: 'touches' });
    expect(d.update(10 + cover.holdMs, Array(3).fill(finger)).completed).toBe(true);
  });

  it('große Kontaktfläche zählt auch', () => {
    const d = new CoverDetector(cover);
    expect(d.update(0, [palm])).toMatchObject({ covered: true, method: 'area' });
  });

  it('Loslassen setzt die Haltezeit zurück, merkt sich aber die meisten Finger', () => {
    const d = new CoverDetector(cover);
    d.update(0, Array(5).fill(finger));
    d.update(cover.holdMs - 10, []);
    const s = d.update(cover.holdMs + 10, Array(3).fill(finger));
    expect(s.heldMs).toBe(0);
    expect(s.completed).toBe(false);
    expect(s.maxTouches).toBe(5);
  });
});
