import { useEffect, useRef } from 'react';
import {
  BlowDetector,
  CoverDetector,
  RockDetector,
  type CareKind,
  type GameConfig,
  type TouchPoint,
} from '@kuckuckskind/shared';
import { useSensors, useSensorsState } from '../sensors/hooks.ts';
import type { ChickRunner } from './ChickRunner.ts';

/** Ersatz-Tasten, die gerade gedrückt sind. */
export type ManualCare = Partial<Record<CareKind, boolean>>;

/**
 * Liest während einer Station die Sensoren dieses Handys und gibt dem Runner laufend,
 * was der Halter gerade tut. Werte der Kalibrierung (Ruhepegel, Empfindlichkeit, Finger)
 * kommen aus dem Ausbrüten. `config` muss stabil sein (useStable), sonst startet die
 * Erkennung bei jeder Raum-Nachricht neu.
 */
export function useCareInput(
  runner: ChickRunner | null,
  config: GameConfig,
  coverArea: React.RefObject<HTMLElement | null>,
  manual: React.RefObject<ManualCare>,
  active: boolean,
) {
  const sensors = useSensors();
  // Nach Neuladen werden Sensoren erst durch Antippen wieder eingeschaltet → dann neu verbinden.
  const { enabled } = useSensorsState();
  const touches = useRef<TouchPoint[]>([]);

  useEffect(() => {
    if (!runner || !active) {
      runner?.setInput({ active: [], rough: false });
      return;
    }
    const stored = sensors.getState().stored;
    const blow = new BlowDetector(config.sensors.blow, stored.noiseDb ?? -60);
    const rock = new RockDetector(config.sensors.rock, stored.rockScale ?? 1);
    const cover = new CoverDetector({
      ...config.sensors.cover,
      minTouchPoints: stored.coverMinTouchPoints ?? config.sensors.cover.minTouchPoints,
    });
    let blowing = false;
    let rockZone: ReturnType<typeof rock.push>['zone'] = 'still';

    const unsubMic = sensors.mic?.subscribe((t, db) => {
      const s = blow.push(t, db);
      // Kurzes Geräusch (Sprechen, Lachen) zählt nicht – erst anhaltendes Pusten.
      blowing = s.blowing && s.blowMs >= config.sensors.blow.minDurationMs;
    });
    const unsubMotion = sensors.motion?.subscribe((t, m) => {
      rockZone = rock.push(t, m).zone;
    });

    const el = coverArea.current;
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      touches.current = Array.from(e.touches, (tp) => ({
        radius: Math.max(tp.radiusX || 0, tp.radiusY || 0),
      }));
    };
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
    for (const type of types) el?.addEventListener(type, onTouch, { passive: false });

    const id = setInterval(() => {
      const kinds = config.care.activeKinds;
      const covered = cover.update(performance.now(), touches.current);
      const m = manual.current ?? {};
      const on: CareKind[] = [];
      if (kinds.includes('blow') && (blowing || m.blow)) on.push('blow');
      if (kinds.includes('rock') && (rockZone === 'gentle' || m.rock)) on.push('rock');
      if (kinds.includes('cover') && ((covered.covered && covered.heldMs >= 200) || m.cover)) {
        on.push('cover');
      }
      runner.setInput({ active: on, rough: rockZone === 'harsh' });
    }, 100);

    return () => {
      clearInterval(id);
      unsubMic?.();
      unsubMotion?.();
      for (const type of types) el?.removeEventListener(type, onTouch);
      runner.setInput({ active: [], rough: false });
    };
  }, [runner, config, sensors, coverArea, manual, active, enabled]);
}
