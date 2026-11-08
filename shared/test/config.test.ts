import { describe, expect, it } from 'vitest';
import {
  GameConfigSchema,
  MODULE_IDS,
  NEEDS,
  CARE_FOR_NEED,
  NEED_FOR_CARE,
  defaultGameConfig,
  deepMerge,
  resolveConfig,
  tryResolveConfig,
} from '../src/index.ts';

describe('Spielkonfiguration', () => {
  it('liefert die Standardwerte aus CLAUDE.md', () => {
    expect(defaultGameConfig.timing.stationSeconds).toBe(60);
    expect(defaultGameConfig.needs.neglectThresholdSeconds).toBe(20);
    expect(defaultGameConfig.room.minPlayers).toBe(3);
    expect(defaultGameConfig.room.maxPlayers).toBe(8);
    expect(defaultGameConfig.room.cuckooCount).toBe(1);
    expect(defaultGameConfig.room.rounds).toBeNull();
    expect(defaultGameConfig.care.activeKinds).toEqual(['blow', 'rock', 'cover']);
    expect(defaultGameConfig.modules.fox.quorumShare).toBeCloseTo(2 / 3);
  });

  it('hat alle Module standardmäßig aus', () => {
    for (const id of MODULE_IDS) {
      expect(defaultGameConfig.modules[id].enabled, id).toBe(false);
    }
  });

  it('Zuflüstern verlangt immer Einwilligung', () => {
    expect(defaultGameConfig.modules.whisper.requireAdultConsent).toBe(true);
    expect(
      tryResolveConfig({ modules: { whisper: { requireAdultConsent: false as true } } }).success,
    ).toBe(false);
  });

  it('Bedürfnisse und Pflegearten passen eins zu eins', () => {
    for (const need of NEEDS) expect(NEED_FOR_CARE[CARE_FOR_NEED[need]]).toBe(need);
  });

  it('wendet Overrides tief und in Reihenfolge an', () => {
    const c = resolveConfig(
      { timing: { stationSeconds: 45 }, needs: { heat: { growthPerSecond: 0.05 } } },
      { timing: { stationSeconds: 30 } },
    );
    expect(c.timing.stationSeconds).toBe(30);
    expect(c.timing.nextLeadMs).toBe(defaultGameConfig.timing.nextLeadMs);
    expect(c.needs.heat.growthPerSecond).toBe(0.05);
    expect(c.needs.heat.reliefPerSecond).toBe(defaultGameConfig.needs.heat.reliefPerSecond);
  });

  it('ersetzt Arrays statt sie zu mischen', () => {
    const c = resolveConfig({ care: { activeKinds: ['blow'] } });
    expect(c.care.activeKinds).toEqual(['blow']);
  });

  it('lehnt Werte außerhalb der Grenzen ab', () => {
    expect(tryResolveConfig({ timing: { stationSeconds: 1 } }).success).toBe(false);
    expect(tryResolveConfig({ room: { maxPlayers: 99 } }).success).toBe(false);
  });

  it('prüft Abhängigkeiten zwischen Werten', () => {
    expect(tryResolveConfig({ room: { minPlayers: 3, cuckooCount: 3 } }).success).toBe(false);
    expect(tryResolveConfig({ room: { minPlayers: 5, maxPlayers: 4 } }).success).toBe(false);
    expect(tryResolveConfig({ sensors: { rock: { gentleMin: 5, gentleMax: 4 } } }).success).toBe(
      false,
    );
    expect(tryResolveConfig({ care: { activeKinds: ['blow', 'blow'] } }).success).toBe(false);
  });

  it('verändert die Standardwerte nicht', () => {
    resolveConfig({ timing: { stationSeconds: 99 } });
    expect(defaultGameConfig.timing.stationSeconds).toBe(60);
    expect(Object.isFrozen(defaultGameConfig)).toBe(true);
  });

  it('deepMerge ignoriert undefined und Nicht-Objekte', () => {
    expect(deepMerge({ a: 1, b: { c: 2 } }, undefined, { b: { c: undefined, d: 3 } })).toEqual({
      a: 1,
      b: { c: 2, d: 3 },
    });
  });

  it('jedes Feld hat eine Beschriftung für den Admin-Bereich', () => {
    const json = GameConfigSchema.toJSONSchema({ io: 'input', unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    const missing: string[] = [];
    const walk = (node: Record<string, unknown>, path: string) => {
      const props = node.properties as Record<string, Record<string, unknown>> | undefined;
      if (!props) return;
      for (const [key, child] of Object.entries(props)) {
        if (typeof child.label !== 'string') missing.push(`${path}${key}`);
        walk(child, `${path}${key}.`);
      }
    };
    walk(json, '');
    expect(missing).toEqual([]);
  });
});
