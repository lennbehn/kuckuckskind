import type { GameConfig, ModuleId } from '../config/schema.ts';
import type { GameModule } from './types.ts';

/**
 * Register der verfügbaren Module. In der Basisversion ist es leer; jedes Modul
 * (Fuchs, Umarmung, …) registriert sich hier, sobald es gebaut ist.
 */
export class ModuleRegistry {
  private readonly modules = new Map<ModuleId, GameModule>();

  register(module: GameModule): this {
    if (this.modules.has(module.id)) {
      throw new Error(`Modul „${module.id}“ ist bereits registriert.`);
    }
    this.modules.set(module.id, module);
    return this;
  }

  get(id: ModuleId): GameModule | undefined {
    return this.modules.get(id);
  }

  /** Alle registrierten Module, die laut Konfiguration aktiv sind. */
  active(config: GameConfig): GameModule[] {
    return [...this.modules.values()].filter((m) => m.isEnabled(config));
  }

  /** Module, die in der Konfiguration eingeschaltet, aber noch nicht gebaut sind. */
  missing(config: GameConfig): ModuleId[] {
    return (Object.keys(config.modules) as ModuleId[]).filter(
      (id) => config.modules[id].enabled && !this.modules.has(id),
    );
  }
}
