import { describe, expect, it } from 'vitest';
import {
  ModuleRegistry,
  createRng,
  defaultGameConfig,
  resolveConfig,
  type GameModule,
} from '../src/index.ts';

describe('Zufall', () => {
  it('ist mit gleichem Seed reproduzierbar', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 10 }, () => a.next());
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });

  it('mischt ohne Elemente zu verlieren', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng(7).shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('int bleibt in den Grenzen', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(2, 5);
      expect(v >= 2 && v <= 5).toBe(true);
    }
  });
});

describe('Modul-Register', () => {
  const fox: GameModule<{ seen: number }> = {
    id: 'fox',
    isEnabled: (c) => c.modules.fox.enabled,
    init: () => ({ seen: 0 }),
  };

  it('liefert nur aktive Module', () => {
    const reg = new ModuleRegistry().register(fox as GameModule);
    expect(reg.active(defaultGameConfig)).toHaveLength(0);
    expect(reg.active(resolveConfig({ modules: { fox: { enabled: true } } }))).toHaveLength(1);
  });

  it('meldet eingeschaltete, aber fehlende Module', () => {
    const reg = new ModuleRegistry();
    expect(reg.missing(resolveConfig({ modules: { hug: { enabled: true } } }))).toEqual(['hug']);
  });

  it('verhindert doppelte Registrierung', () => {
    const reg = new ModuleRegistry().register(fox as GameModule);
    expect(() => reg.register(fox as GameModule)).toThrow();
  });
});
