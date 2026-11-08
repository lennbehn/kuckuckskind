import { useEffect, useMemo, useRef, useState } from 'react';
import { NEED_FOR_CARE, type ChickState, type GameConfig, type Need } from '@kuckuckskind/shared';
import { ChickArt } from '../../art/ChickArt.tsx';
import { chickParamsFor, needTints, type ChickParams } from '../../art/chickParams.ts';
import { NeedIcon } from '../../art/NeedIcon.tsx';
import { Particles } from '../../art/Particles.tsx';
import { coo, peep } from '../../art/sound.ts';
import { useSpringParams } from '../../art/spring.ts';

/** Lidschlag alle 2–5 s (nicht bei geschlossenen Augen). */
function useBlink(enabled: boolean): number {
  const [blink, setBlink] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(
        () => {
          setBlink(1);
          t = setTimeout(() => {
            setBlink(0);
            schedule();
          }, 130);
        },
        2000 + Math.random() * 3000,
      );
    };
    schedule();
    return () => clearTimeout(t);
  }, [enabled]);
  return enabled ? blink : 0;
}

/** Gleicher Inhalt → gleiches Objekt, damit die Feder nicht bei jedem Takt neu startet. */
function useStableParams(p: ChickParams): ChickParams {
  const key = JSON.stringify(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => p, [key]);
}

/**
 * Lebendiges Küken: Ausdruck folgt dem Zustand stufenlos (Feder), Atmen und Blinzeln laufen
 * immer, Herzchen bei Lieblingspflege, Federn bei Schaden. `sound` nur auf dem Stations-Bildschirm.
 */
export function Chick({
  state,
  config,
  hurting = false,
  liked = false,
  size = 200,
  sound = false,
}: {
  state: ChickState;
  config: GameConfig;
  hurting?: boolean;
  liked?: boolean;
  size?: number;
  sound?: boolean;
}) {
  const target = useStableParams(chickParamsFor(state, config, { hurting, liked }));
  const params = useSpringParams(target);
  const tintKey = JSON.stringify(needTints(state, config));
  const tints = useMemo(() => JSON.parse(tintKey), [tintKey]);
  const blink = useBlink(state.alive && params.eyeOpen > 0.3);
  const restless = state.needs.restless > 0.6 && config.care.activeKinds.includes('rock');

  // Töne bei Zustandswechseln (nicht dauernd).
  const prev = useRef({ hurting, liked, urgent: false });
  const urgent = config.care.activeKinds.some((k) => state.needs[NEED_FOR_CARE[k]] >= 0.6);
  useEffect(() => {
    if (!sound) return;
    const p = prev.current;
    if (hurting && !p.hurting) peep(true);
    else if (liked && !p.liked) coo();
    else if (urgent && !p.urgent) peep(false);
    prev.current = { hurting, liked, urgent };
  }, [sound, hurting, liked, urgent]);

  return (
    <div
      className={`chick ${state.alive ? '' : 'chick-gone'}`}
      style={{ width: size, height: size }}
    >
      <ChickArt
        params={params}
        tints={tints}
        blink={blink}
        size={size}
        jitter={restless}
        title={state.alive ? `Küken, ${moodWord(state.wellbeing)}` : 'Küken ist nicht mehr da'}
      />
      <Particles kind="hearts" active={liked && state.alive} />
      <Particles kind="feathers" active={hurting} />
    </div>
  );
}

const moodWord = (w: number) =>
  w > 0.75 ? 'zufrieden' : w > 0.45 ? 'etwas unglücklich' : 'traurig';

/** Was der Halter tun soll – steht unter dem Symbol im Hinweisfeld. */
export const NEED_ACTION: Record<Need, string> = {
  heat: 'Pusten',
  restless: 'Wiegen',
  tired: 'Zudecken',
  hunger: 'Füttern',
  bored: 'Vorsingen',
};

/**
 * Hinweisfeld: Symbole für spürbare Bedürfnisse, Größe nach Stärke (keine genauen Zahlen),
 * darunter die passende Pflege.
 */
export function NeedHints({ state, config }: { state: ChickState; config: GameConfig }) {
  const needs = config.care.activeKinds
    .map((k) => NEED_FOR_CARE[k])
    .filter((n) => state.needs[n] > 0.35);
  return (
    <div className="need-hints" aria-live="polite">
      {needs.length === 0 ? (
        <span className="hint">Alles ruhig.</span>
      ) : (
        needs.map((n) => (
          <figure key={n} className="need-hint">
            <NeedIcon need={n} strength={Math.min(1, (state.needs[n] - 0.35) / 0.65)} />
            <figcaption>{NEED_ACTION[n]}</figcaption>
          </figure>
        ))
      )}
    </div>
  );
}
