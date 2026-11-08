import { describe, expect, it } from 'vitest';
import { resolveConfig, type ChickState } from '@kuckuckskind/shared';
import {
  MOODS,
  PARAM_KEYS,
  chickParamsFor,
  mixParams,
  needTints,
  type Mood,
} from '../src/art/chickParams.ts';
import {
  beakBottomPath,
  bodyPath,
  browPath,
  commandCount,
  eyePath,
  mouthPath,
  tuftPaths,
} from '../src/art/chickGeometry.ts';
import { settled, stepSpring } from '../src/art/spring.ts';

const config = resolveConfig();
const state = (patch: Partial<ChickState> = {}): ChickState => ({
  needs: { heat: 0.1, restless: 0.1, tired: 0.1, hunger: 0, bored: 0 },
  urgentMs: { heat: 0, restless: 0, tired: 0, hunger: 0, bored: 0 },
  wellbeing: 1,
  alive: true,
  stationLoss: 0,
  ...patch,
});

describe('Stimmungen', () => {
  it('jede Stimmung setzt alle Werte', () => {
    for (const mood of Object.keys(MOODS) as Mood[]) {
      for (const k of PARAM_KEYS) expect(typeof MOODS[mood][k], `${mood}.${k}`).toBe('number');
    }
  });

  it('Befinden bestimmt die Grundstimmung', () => {
    expect(chickParamsFor(state(), config).mouth).toBeGreaterThan(0);
    expect(chickParamsFor(state({ wellbeing: 0.2 }), config).mouth).toBeLessThan(0);
    expect(chickParamsFor(state({ alive: false }), config)).toEqual(MOODS.gone);
  });

  it('Bedürfnisse zeigen sich im Gesicht', () => {
    const tired = chickParamsFor(
      state({ needs: { heat: 0.1, restless: 0.1, tired: 1, hunger: 0, bored: 0 } }),
      config,
    );
    expect(tired.eyeOpen).toBeLessThan(0.6);
    const hot = chickParamsFor(
      state({ needs: { heat: 1, restless: 0.1, tired: 0.1, hunger: 0, bored: 0 } }),
      config,
    );
    expect(hot.blush).toBeGreaterThan(0.7);
    expect(hot.mouthOpen).toBeGreaterThan(0.4);
  });

  it('Schaden bringt Tränen, Lieblingspflege ein Strahlen', () => {
    expect(chickParamsFor(state(), config, { hurting: true }).tears).toBeGreaterThan(0.6);
    expect(chickParamsFor(state(), config, { liked: true }).eyeSmile).toBeGreaterThan(0.6);
  });

  it('Werte sind gestuft (weniger Neuberechnung)', () => {
    const p = chickParamsFor(state({ wellbeing: 0.613 }), config);
    for (const k of PARAM_KEYS)
      expect(Math.abs(p[k] * 20 - Math.round(p[k] * 20))).toBeLessThan(1e-9);
  });

  it('Farbe je Bedürfnis erst ab spürbarem Pegel', () => {
    const t = needTints(
      state({ needs: { heat: 1, restless: 0.2, tired: 0.6, hunger: 0, bored: 0 } }),
      config,
    );
    expect(t.heat).toBe(1);
    expect(t.restless).toBe(0);
    expect(t.tired).toBeGreaterThan(0);
  });
});

describe('Geometrie', () => {
  it('alle Formen haben in jeder Stimmung gleich viele Punkte', () => {
    const counts = (p: (typeof MOODS)[Mood], blink = 0) => [
      commandCount(eyePath(82, 98, p, blink)),
      commandCount(browPath(82, 98, -1, p)),
      commandCount(beakBottomPath(p)),
      commandCount(mouthPath(p)),
      ...tuftPaths(p).map(commandCount),
    ];
    const ref = counts(MOODS.content);
    for (const mood of Object.keys(MOODS) as Mood[]) {
      expect(counts(MOODS[mood])).toEqual(ref);
      expect(counts(MOODS[mood], 1)).toEqual(ref);
      expect(counts(mixParams(MOODS[mood], MOODS.happy, 0.37))).toEqual(ref);
    }
    expect(commandCount(bodyPath())).toBe(1 + 12 + 1);
  });

  it('Lächeln hebt die Mundwinkel, Traurigkeit senkt sie', () => {
    // Pfad beginnt mit "M88 <y>": y des linken Mundwinkels (kleiner = höher).
    const cornerY = (d: string) => Number(d.split(' ')[1]);
    expect(cornerY(mouthPath(MOODS.happy))).toBeLessThan(cornerY(mouthPath(MOODS.sad)));
  });
});

describe('Feder', () => {
  it('erreicht das Ziel ohne großes Überschwingen', () => {
    let s = { value: MOODS.content, velocity: mixParams(MOODS.content, MOODS.content, 0) };
    for (const k of PARAM_KEYS) s.velocity[k] = 0;
    let maxMouth = -Infinity;
    for (let i = 0; i < 120; i++) {
      s = stepSpring(s, MOODS.happy, 1 / 60);
      maxMouth = Math.max(maxMouth, s.value.mouth);
    }
    expect(settled(s, MOODS.happy, 0.01)).toBe(true);
    expect(maxMouth).toBeLessThan(MOODS.happy.mouth + 0.15);
  });
});
