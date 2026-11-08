import { useEffect, useRef, useState } from 'react';
import { PARAM_KEYS, type ChickParams } from './chickParams.ts';

/** Feder je Wert (kritisch leicht unterdämpft – wirkt lebendig, schwingt kaum über). */
export interface SpringState {
  value: ChickParams;
  velocity: ChickParams;
}

const STIFFNESS = 140;
const DAMPING = 18;

export function stepSpring(s: SpringState, target: ChickParams, dt: number): SpringState {
  const value = { ...s.value };
  const velocity = { ...s.velocity };
  const h = Math.min(dt, 1 / 30);
  for (const k of PARAM_KEYS) {
    const a = STIFFNESS * (target[k] - value[k]) - DAMPING * velocity[k];
    velocity[k] += a * h;
    value[k] += velocity[k] * h;
  }
  return { value, velocity };
}

export function settled(s: SpringState, target: ChickParams, eps = 0.002): boolean {
  return PARAM_KEYS.every(
    (k) => Math.abs(s.value[k] - target[k]) < eps && Math.abs(s.velocity[k]) < eps,
  );
}

const zero = (p: ChickParams): ChickParams => {
  const out = { ...p };
  for (const k of PARAM_KEYS) out[k] = 0;
  return out;
};

/** Stufenloser Übergang zum Zielausdruck; rechnet nur, solange sich etwas bewegt. */
export function useSpringParams(target: ChickParams): ChickParams {
  const [value, setValue] = useState(target);
  const state = useRef<SpringState>({ value: target, velocity: zero(target) });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      state.current = stepSpring(state.current, target, dt);
      if (settled(state.current, target)) {
        state.current = { value: target, velocity: zero(target) };
        setValue(target);
        return;
      }
      setValue(state.current.value);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return value;
}
