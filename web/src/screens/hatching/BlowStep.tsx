import { useEffect, useRef, useState } from 'react';
import { BlowDetector, NoiseFloor, type GameConfig } from '@kuckuckskind/shared';
import { useSensors, useSensorsState } from '../../sensors/hooks.ts';
import type { StepProps } from './steps.ts';
import { FallbackButton } from './FallbackButton.tsx';
import { sensorProblem } from './sensorText.ts';
import { useElapsed } from './useElapsed.ts';
import { useLatest } from './useStable.ts';

type Phase = 'quiet' | 'blow';

/** Pusten: erst Ruhepegel messen („kurz still“), dann über Ruhepegel + Schwelle pusten. */
export function BlowStep({ config, onDone }: StepProps) {
  const sensors = useSensors();
  const { mic: status } = useSensorsState();
  const problem = sensorProblem('mic', status, sensors.platform);
  const elapsed = useElapsed();
  const [phase, setPhase] = useState<Phase>('quiet');
  const [level, setLevel] = useState(0);
  const finished = useRef(false);
  const done = useLatest(onDone);

  useEffect(() => {
    const mic = sensors.mic;
    if (!mic) return;
    const cfg = config.sensors.blow;
    const floor = new NoiseFloor();
    const startedAt = performance.now();
    let detector: BlowDetector | null = null;
    return mic.subscribe((t, db) => {
      if (!detector) {
        floor.push(db);
        if (t - startedAt >= cfg.calibrationMs) {
          detector = new BlowDetector(cfg, floor.result() ?? db);
          setPhase('blow');
        }
        return;
      }
      const s = detector.push(t, db);
      setLevel(meter(db, detector.noiseDb, detector.thresholdDb));
      if (s.completed && !finished.current) {
        finished.current = true;
        sensors.store({ noiseDb: round(detector.noiseDb), peakDb: round(s.peakDb) });
        done.current('sensor');
      }
    });
  }, [sensors, config, done]);

  return (
    <StepLayout
      title="Dem Ei ist ganz warm."
      text={
        phase === 'quiet'
          ? 'Pssst … kurz ganz still sein.'
          : 'Puste sanft aufs Ei – ein paar Sekunden lang!'
      }
      problem={problem}
      meter={sensors.mic && phase === 'blow' ? level : null}
      fallback={
        (problem || elapsed > config.hatching.fallbackAfterSeconds) && (
          <FallbackButton
            label="Statt Pusten: hier gedrückt halten"
            holdMs={config.hatching.fallbackHoldMs}
            onDone={() => onDone('fallback')}
          />
        )
      }
    />
  );
}

/** Pegel als 0…1 zwischen Ruhepegel und etwas über der Schwelle; 0.75 = Schwelle. */
const meter = (db: number, noise: number, threshold: number) =>
  Math.max(0, Math.min(1, ((db - noise) / (threshold - noise)) * 0.75));

const round = (v: number) => Math.round(v * 10) / 10;

export function StepLayout({
  title,
  text,
  problem,
  meter,
  meterLabel,
  fallback,
  children,
}: {
  title: string;
  text: string;
  problem?: string | null;
  meter?: number | null;
  meterLabel?: string;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="step">
      <h2>{title}</h2>
      <p className="lead">{text}</p>
      {children}
      {meter != null && (
        <div className="meter" aria-label={meterLabel ?? 'Pegel'}>
          <div className="meter-fill" style={{ width: `${meter * 100}%` }} />
          <div className="meter-mark" />
        </div>
      )}
      {meterLabel && <p className="hint">{meterLabel}</p>}
      {problem && <p className="problem">{problem}</p>}
      {fallback}
    </div>
  );
}

export type { GameConfig };
