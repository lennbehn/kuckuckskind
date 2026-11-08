import type { GameConfig, ModuleId, Need } from '../config/schema.ts';
import type { Phase } from '../game/phase.ts';
import type { Rng } from '../game/rng.ts';

/**
 * Schnittstelle für Spiel-Module (Fuchs, Umarmung, Gewitter, …).
 *
 * Module sind reine Funktionen über ihrem eigenen Zustand `S`: Sie bekommen den
 * alten Zustand und liefern den neuen. Nebenwirkungen laufen nur über `ctx.emit`
 * (Ereignisse, die der Server verteilt) – so bleiben sie deterministisch testbar.
 * Der Raum-Automat auf dem Server ruft die Hooks auf; nur aktive Module laufen.
 */
export interface GameModule<S = unknown> {
  readonly id: ModuleId;

  /** Ob das Modul für diese Konfiguration läuft (meist `config.modules[id].enabled`). */
  isEnabled(config: GameConfig): boolean;

  /** Anfangszustand beim Start der Partie. */
  init(ctx: ModuleContext): S;

  /** Phasenwechsel der Partie. */
  onPhaseChange?(state: S, phase: Phase, ctx: ModuleContext): S;

  /** Regelmäßiger Server-Takt. */
  onTick?(state: S, dtMs: number, ctx: ModuleContext): S;

  /** Sensor-Ereignis eines Geräts (z. B. Lautstärke-Spitze, Stoß). */
  onSensorEvent?(state: S, event: SensorEvent, ctx: ModuleContext): S;

  /** Nachricht eines Clients an dieses Modul (z. B. „Umarmung ablehnen“). */
  onClientMessage?(state: S, playerId: string, payload: unknown, ctx: ModuleContext): S;

  /** Wirkung des Moduls auf die Bedürfnis-Simulation eines Kükens. */
  needModifiers?(state: S, chickId: string, ctx: ModuleContext): NeedModifiers;
}

export interface ModuleContext {
  /** Server-Zeit in ms. */
  readonly now: number;
  readonly config: GameConfig;
  readonly rng: Rng;
  /** Spieler in Sitzordnung (im Uhrzeigersinn). */
  readonly seating: readonly string[];
  /** Aktuelle Runde (0-basiert) oder null außerhalb der Runden. */
  readonly round: number | null;
  /** Ereignis auslösen; `to` = Spieler-IDs, die es sehen dürfen (leer = alle). */
  emit(event: ModuleEmit): void;
}

export interface ModuleEmit {
  type: string;
  payload?: unknown;
  /** Empfänger; weggelassen = alle Spieler im Raum. */
  to?: readonly string[];
  /** Server-Zeitpunkt, zu dem alle Geräte das Ereignis zeigen sollen. */
  at?: number;
}

export type SensorEvent =
  | { kind: 'loudness'; playerId: string; at: number; dbOverNoise: number }
  | { kind: 'bump'; playerId: string; at: number; magnitude: number }
  | { kind: 'cover'; playerId: string; at: number; covered: boolean };

export interface NeedModifiers {
  /** Faktor auf das Wachstum je Bedürfnis (1 = unverändert). */
  growthFactor?: Partial<Record<Need, number>>;
  /** Zusätzlicher Anstieg je Bedürfnis pro Sekunde. */
  extraGrowthPerSecond?: Partial<Record<Need, number>>;
}
