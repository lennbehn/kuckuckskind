import { useEffect, useState } from 'react';
import { useLatest } from './useStable.ts';

/** Ersatz-Bedienung: Taste gedrückt halten, bis der Balken voll ist. */
export function FallbackButton({
  label,
  holdMs,
  onDone,
}: {
  label: string;
  holdMs: number;
  onDone: () => void;
}) {
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const done = useLatest(onDone);

  useEffect(() => {
    if (!pressing) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / holdMs);
      setProgress(p);
      if (p >= 1) return done.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setProgress(0);
    };
  }, [pressing, holdMs, done]);

  return (
    <button
      className="fallback"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressing(true);
      }}
      onPointerUp={() => setPressing(false)}
      onPointerCancel={() => setPressing(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ['--p' as string]: progress }}
    >
      {label}
    </button>
  );
}
