import { useEffect, useRef, useState } from 'react';
import { CoverDetector, type TouchPoint } from '@kuckuckskind/shared';
import { useSensors, useSensorsState } from '../../sensors/hooks.ts';
import { StepLayout } from './BlowStep.tsx';
import { FallbackButton } from './FallbackButton.tsx';
import type { StepProps } from './steps.ts';
import { useElapsed } from './useElapsed.ts';
import { useLatest } from './useStable.ts';

const toPoints = (list: TouchList): TouchPoint[] =>
  Array.from(list, (t) => ({ radius: Math.max(t.radiusX || 0, t.radiusY || 0) }));

/**
 * Zudecken: ganze Hand auf das Display (viele Touchpunkte oder große Kontaktfläche).
 * Erkennt ein Gerät die Hand nicht, reichen nach einer Weile weniger Finger.
 */
export function CoverStep({ config, onDone }: StepProps) {
  const sensors = useSensors();
  const { stored } = useSensorsState();
  const elapsed = useElapsed();
  const area = useRef<HTMLDivElement>(null);
  const [fewerFingers, setFewerFingers] = useState(false);
  const [held, setHeld] = useState(0);
  const [fingers, setFingers] = useState(0);
  const finished = useRef(false);
  const done = useLatest(onDone);
  const minTouchPoints = fewerFingers
    ? config.hatching.coverFallbackTouchPoints
    : // Gemerkte Fingerzahl des Geräts, aber nie strenger als die aktuelle Konfiguration.
      Math.min(
        stored.coverMinTouchPoints ?? config.sensors.cover.minTouchPoints,
        config.sensors.cover.minTouchPoints,
      );

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const holdMs = config.hatching.coverHoldMs;
    const detector = new CoverDetector({ ...config.sensors.cover, minTouchPoints, holdMs });
    let touches: TouchPoint[] = [];
    let raf = 0;

    const loop = () => {
      const s = detector.update(performance.now(), touches);
      setHeld(Math.min(1, s.heldMs / holdMs));
      if (s.completed && !finished.current) {
        finished.current = true;
        sensors.store({
          coverMinTouchPoints: minTouchPoints,
          coverMaxTouches: s.maxTouches,
          coverMethod: s.method ?? 'touches',
        });
        done.current('sensor');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault(); // kein Scrollen/Zoomen, solange die Hand drauf liegt
      touches = toPoints(e.touches);
      setFingers(e.touches.length);
    };
    const opts = { passive: false } as const;
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
      el.addEventListener(type, onTouch, opts);
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
        el.removeEventListener(type, onTouch);
      }
    };
  }, [sensors, config, minTouchPoints, done]);

  const offerFewer = !fewerFingers && elapsed > config.hatching.fallbackAfterSeconds;
  const offerButton = elapsed > config.hatching.fallbackAfterSeconds * 2;

  return (
    <StepLayout
      title="Das Ei ist müde."
      text={`Deck es mit der Hand zu (mindestens ${minTouchPoints} Finger) und halte still.`}
      meter={held}
      meterLabel={
        fingers > 0 ? `${fingers} ${fingers === 1 ? 'Finger' : 'Finger'} erkannt` : undefined
      }
      fallback={
        <>
          {offerFewer && (
            <button className="link" onClick={() => setFewerFingers(true)}>
              Klappt nicht? Mit {config.hatching.coverFallbackTouchPoints} Fingern versuchen
            </button>
          )}
          {offerButton && (
            <FallbackButton
              label="Statt Zudecken: hier gedrückt halten"
              holdMs={config.hatching.fallbackHoldMs}
              onDone={() => onDone('fallback')}
            />
          )}
        </>
      }
    >
      <div ref={area} className="cover-area" aria-label="Hier die Hand auflegen">
        ✋
      </div>
    </StepLayout>
  );
}
