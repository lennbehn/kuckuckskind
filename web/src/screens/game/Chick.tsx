import type { CareKind, ChickState, GameConfig, Need } from '@kuckuckskind/shared';
import { NEED_FOR_CARE } from '@kuckuckskind/shared';

/** Farbe je Bedürfnis im Küken (CLAUDE.md: Hitze → rot, Müdigkeit → lila, Unruhe → bläulich). */
const NEED_COLOR: Record<Need, string> = {
  heat: '220 80 60',
  tired: '140 90 190',
  restless: '80 130 210',
  hunger: '200 150 60',
  bored: '120 140 120',
};

export const NEED_SYMBOL: Record<Need, string> = {
  heat: '🔥',
  restless: '🌀',
  tired: '💤',
  hunger: '🍞',
  bored: '🎵',
};

/**
 * Platzhalter-Küken bis zu den Aquarell-SVGs (M5): Farbverlauf je Bedürfnis, Gesicht nach
 * Befinden, Wackeln bei Schaden, Herzchen bei Lieblingspflege.
 */
export function Chick({
  state,
  config,
  hurting = false,
  liked = false,
  size = 200,
}: {
  state: ChickState;
  config: GameConfig;
  hurting?: boolean;
  liked?: boolean;
  size?: number;
}) {
  const needs = config.care.activeKinds.map((k: CareKind) => NEED_FOR_CARE[k]);
  const layers = needs
    .filter((n) => state.needs[n] > 0.25)
    .map((n, i) => {
      const a = Math.min(0.65, (state.needs[n] - 0.25) * 1.1);
      const pos = ['30% 35%', '70% 40%', '50% 75%', '25% 70%', '75% 72%'][i] ?? '50% 50%';
      return `radial-gradient(circle at ${pos}, rgb(${NEED_COLOR[n]} / ${a}) 0%, transparent 60%)`;
    });
  const face = !state.alive
    ? '🪶'
    : state.wellbeing > 0.7
      ? '🐥'
      : state.wellbeing > 0.4
        ? '🐤'
        : '🥺';
  return (
    <div
      className={`chick ${hurting ? 'chick-hurt' : ''} ${state.alive ? '' : 'chick-gone'}`}
      style={{
        width: size,
        height: size,
        background: [
          ...layers,
          'radial-gradient(circle at 40% 35%, #fff6d0, #f6dc7a 70%, #e8c75a)',
        ].join(','),
      }}
      role="img"
      aria-label={
        state.alive
          ? `Küken, Befinden ${Math.round(state.wellbeing * 100)} %`
          : 'Küken ist nicht mehr da'
      }
    >
      <span className="chick-face" style={{ fontSize: size * 0.45 }}>
        {face}
      </span>
      {liked && state.alive && (
        <span className="hearts" aria-hidden>
          💛
        </span>
      )}
    </div>
  );
}

/** Hinweisfeld: Symbole für spürbare Bedürfnisse, Größe nach Stärke (keine genauen Zahlen). */
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
          <span
            key={n}
            style={{
              fontSize: `${1.4 + state.needs[n] * 1.6}rem`,
              opacity: 0.5 + state.needs[n] / 2,
            }}
          >
            {NEED_SYMBOL[n]}
          </span>
        ))
      )}
    </div>
  );
}
