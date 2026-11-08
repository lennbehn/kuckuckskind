import { describe, expect, it } from 'vitest';
import { assignRoles, createRng, cuckooCountFor, resolveConfig } from '../src/index.ts';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('Rollen', () => {
  it('genau so viele Kuckucke wie eingestellt', () => {
    const roles = assignRoles(ids, resolveConfig(), createRng(1));
    expect(Object.values(roles).filter((r) => r === 'cuckoo')).toHaveLength(1);
    expect(Object.keys(roles).sort()).toEqual(ids);
    const two = assignRoles(ids, resolveConfig({ room: { cuckooCount: 2 } }), createRng(1));
    expect(Object.values(two).filter((r) => r === 'cuckoo')).toHaveLength(2);
  });

  it('Familienmodus ohne Kuckuck', () => {
    const roles = assignRoles(
      ids,
      resolveConfig({ modules: { family: { enabled: true } } }),
      createRng(1),
    );
    expect(Object.values(roles).every((r) => r === 'foster')).toBe(true);
  });

  it('nie nur Kuckucke', () => {
    expect(cuckooCountFor(resolveConfig({ room: { cuckooCount: 2 } }), 2)).toBe(1);
  });

  it('jeder kann Kuckuck werden', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const roles = assignRoles(ids, resolveConfig(), createRng(seed));
      seen.add(Object.keys(roles).find((id) => roles[id] === 'cuckoo')!);
    }
    expect([...seen].sort()).toEqual(ids);
  });
});
