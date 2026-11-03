import { useEffect, useRef, useState } from 'react';
import { RockCalibrator, RockDetector, rockZone, type RockZone } from '@kuckuckskind/shared';
import { useSensors, useSensorsState } from '../../sensors/hooks.ts';
import { StepLayout } from './BlowStep.tsx';
import { FallbackButton } from './FallbackButton.tsx';
import { sensorProblem } from './sensorText.ts';
import type { StepProps } from './steps.ts';
import { useElapsed } from './useElapsed.ts';
import { useLatest } from './useStable.ts';

const ZONE_TEXT: Record<RockZone, string> = {
  still: 'Noch etwas mehr …',
  gentle: 'Schön sanft!',
  between: 'Etwas sanfter …',
  harsh: 'Zu wild! Das mag das Ei nicht.',
};

/**
 * Wiegen: Zuerst bestimmt die Bewegung der ersten Sekunden die Empfindlichkeit dieses Geräts
 * (Median → Mitte des sanften Bands), danach zählt die Zeit im sanften Band.
 */
export function RockStep({ config, onDone }: StepProps) {
  const sensors = useSensors();
  const { motion: status } = useSensorsState();
  const problem = sensorProblem('motion', status, sensors.platform);
  const elapsed = useElapsed();
  const [zone, setZone] = useState<RockZone | null>(null);
  const [progress, setProgress] = useState(0);
  const finished = useRef(false);
  const done = useLatest(onDone);

  useEffect(() => {
    const motion = sensors.motion;
    if (!motion) return;
    const cfg = config.sensors.rock;
    const h = config.hatching;
    const raw = new RockDetector(cfg, 1);
    const calibrator = new RockCalibrator({
      ...cfg,
      scaleMin: h.rockScaleMin,
      scaleMax: h.rockScaleMax,
    });
    let scale: number | null = null;
    let detector: RockDetector | null = null;
    return motion.subscribe((t, m) => {
      const unscaled = raw.push(t, m).level;
      if (scale === null) {
        calibrator.push(t, unscaled);
        setProgress(Math.min(0.3, (calibrator.measuredMs / h.rockCalibrationMs) * 0.3));
        if (calibrator.measuredMs >= h.rockCalibrationMs) {
          scale = calibrator.scale();
          detector = new RockDetector(cfg, scale);
          sensors.store({ rockScale: Math.round(scale * 100) / 100 });
        }
        setZone(unscaled > 0.3 ? 'gentle' : 'still');
        return;
      }
      const s = detector!.push(t, m);
      setZone(rockZone(s.level, cfg));
      setProgress(0.3 + 0.7 * Math.min(1, s.gentleMs / h.rockGentleMs));
      if (s.gentleMs >= h.rockGentleMs && !finished.current) {
        finished.current = true;
        done.current('sensor');
      }
    });
  }, [sensors, config, done]);

  return (
    <StepLayout
      title="Das Ei ist unruhig."
      text="Nimm das Handy in beide Hände und wiege es sanft hin und her."
      problem={problem}
      meter={sensors.motion ? progress : null}
      meterLabel={sensors.motion && zone ? ZONE_TEXT[zone] : undefined}
      fallback={
        (problem || elapsed > config.hatching.fallbackAfterSeconds) && (
          <FallbackButton
            label="Statt Wiegen: hier gedrückt halten"
            holdMs={config.hatching.fallbackHoldMs}
            onDone={() => onDone('fallback')}
          />
        )
      }
    />
  );
}
