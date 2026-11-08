import { useEffect } from 'react';
import type { RoomView } from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';
import { useSensors } from '../sensors/hooks.ts';
import { useChickRunner } from './runnerHost.tsx';

/**
 * Live-Debug: Solange ein Admin den Raum ansieht (`debugUntil`), schickt das Handy etwa
 * zweimal pro Sekunde seine Messwerte – Mikrofonpegel, Bewegung, Finger, laufende Pflege.
 * Kein Ton und keine Rohdaten, nur Zahlen.
 */
export function LevelsReporter({ room }: { room: RoomView }) {
  const client = useGameClient();
  const sensors = useSensors();
  const runner = useChickRunner();
  const until = room.debugUntil;

  useEffect(() => {
    if (!until) return;
    let motionPeak: number | null = null;
    let touches = 0;
    const unsubMotion = sensors.motion?.subscribe((_t, m) => {
      motionPeak = Math.max(motionPeak ?? 0, m);
    });
    const onTouch = (e: TouchEvent) => {
      touches = e.touches.length;
    };
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
    for (const t of types) window.addEventListener(t, onTouch, { passive: true, capture: true });

    const id = setInterval(() => {
      if (client.serverNow() > until) return;
      const input = runner?.getView().input;
      client.sendLevels({
        at: client.serverNow(),
        micDb: sensors.mic ? Math.round(sensors.mic.db * 10) / 10 : null,
        motion: motionPeak === null ? null : Math.round(motionPeak * 100) / 100,
        touches,
        care: [...(input?.active ?? [])],
        rough: input?.rough ?? false,
        visible: document.visibilityState === 'visible',
      });
      motionPeak = sensors.motion ? 0 : null;
    }, 500);

    return () => {
      clearInterval(id);
      unsubMotion?.();
      for (const t of types) window.removeEventListener(t, onTouch, { capture: true });
    };
  }, [client, sensors, runner, until]);

  return null;
}
