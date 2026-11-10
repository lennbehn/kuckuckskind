import { describe, expect, it } from 'vitest';
import {
  createRng,
  earnsFalcon,
  emptyStats,
  featherFalls,
  harmByHolder,
  mistakeMs,
  owlVerdict,
  pickOwl,
  resolveConfig,
  holderOf,
  type StationStats,
} from '../src/index.ts';

const config = resolveConfig();
const st = (round: number, patch: Partial<StationStats> = {}): StationStats => ({
  ...emptyStats(round, 1),
  durationMs: 60_000,
  ...patch,
});

describe('Falkenblick', () => {
  it('nur für sehr gute Pflege', () => {
    expect(earnsFalcon(st(0, { reliefMs: { blow: 8000 }, loss: 0.01 }), config)).toBe(true);
    expect(earnsFalcon(st(0, { reliefMs: { blow: 8000 }, loss: 0.1 }), config)).toBe(false);
    expect(earnsFalcon(st(0, { reliefMs: { blow: 1000 } }), config)).toBe(false); // kaum gepflegt
    expect(earnsFalcon(st(0, { reliefMs: { blow: 8000 }, roughMs: 3000 }), config)).toBe(false);
    expect(
      earnsFalcon(
        st(0, { reliefMs: { blow: 8000 } }),
        resolveConfig({ modules: { falcon: { enabled: false } } }),
      ),
    ).toBe(false);
  });

  it('zählt Fehlpflege zusammen', () => {
    expect(
      mistakeMs(
        st(0, { overcareMs: { blow: 500 }, wrongCareMs: { 'heat>rock': 700 }, roughMs: 300 }),
      ),
    ).toBe(1500);
  });
});

describe('Kuckucksfedern', () => {
  const heavy = st(1, { loss: 0.3 });
  const on = resolveConfig({ modules: { feathers: { enabled: true } } });

  it('fallen nur bei starkem Schaden und nur mit eingeschaltetem Modul', () => {
    const always = resolveConfig({ modules: { feathers: { enabled: true, cuckooChance: 1 } } });
    expect(featherFalls(st(1, { loss: 0.02 }), 'cuckoo', always, createRng(1))).toBe(false);
    expect(featherFalls(heavy, 'cuckoo', always, createRng(1))).toBe(true);
    const off = resolveConfig({ modules: { feathers: { cuckooChance: 1 } } });
    expect(featherFalls(heavy, 'cuckoo', off, createRng(1))).toBe(false);
  });

  it('bei Pflegeeltern nie, wenn fosterChance 0 ist', () => {
    const strict = resolveConfig({ modules: { feathers: { enabled: true, fosterChance: 0 } } });
    for (let seed = 0; seed < 50; seed++) {
      expect(featherFalls(heavy, 'foster', strict, createRng(seed))).toBe(false);
    }
  });

  it('mit der eingestellten Wahrscheinlichkeit je Rolle', () => {
    for (const role of ['cuckoo', 'foster'] as const) {
      let n = 0;
      const rng = createRng(3);
      for (let i = 0; i < 4000; i++) if (featherFalls(heavy, role, on, rng)) n++;
      const c = on.modules.feathers;
      expect(n / 4000).toBeCloseTo(role === 'cuckoo' ? c.cuckooChance : c.fosterChance, 1);
    }
  });
});

describe('Eule', () => {
  const config = resolveConfig({ modules: { owl: { enabled: true } } });
  const roles = { a: 'foster', b: 'cuckoo', c: 'foster', d: 'foster' } as const;

  it('ist immer ein Pflegeelternteil, nur mit Kuckuck und genug Spielern', () => {
    for (let seed = 0; seed < 30; seed++) {
      const owl = pickOwl({ ...roles }, config, createRng(seed));
      expect(owl).not.toBeNull();
      expect(roles[owl as keyof typeof roles]).toBe('foster');
    }
    expect(pickOwl({ a: 'foster', b: 'cuckoo', c: 'foster' }, config, createRng(1))).toBeNull();
    expect(
      pickOwl({ a: 'foster', b: 'foster', c: 'foster', d: 'foster' }, config, createRng(1)),
    ).toBeNull();
  });

  it('Schaden wird dem Halter zugeordnet, das eigene Küken zählt nicht', () => {
    const seating = ['a', 'b', 'c', 'd'];
    // Runde 1: Küken von a hält b.
    expect(holderOf('a', 1, seating)).toBe('b');
    const harm = harmByHolder(
      { a: { '0': st(0, { loss: 0.3 }), '1': st(1, { loss: 0.25 }) } },
      seating,
    );
    expect(harm.b?.loss).toBeCloseTo(0.25);
    expect(harm.a?.loss).toBe(0);
  });

  it('Urteil nach Rang: oben viel, unten wenig, symmetrisch', () => {
    const h = (loss: number) => ({ loss, mistakeMs: 0, stations: 1 });
    const harm = { owl: h(0), a: h(0.3), b: h(0.2), c: h(0.1), d: h(0) };
    expect(owlVerdict('a', 'owl', harm)).toBe('high');
    expect(owlVerdict('b', 'owl', harm)).toBe('medium');
    expect(owlVerdict('c', 'owl', harm)).toBe('medium');
    expect(owlVerdict('d', 'owl', harm)).toBe('low');
    expect(owlVerdict('x', 'owl', harm)).toBe('medium');
  });
});
