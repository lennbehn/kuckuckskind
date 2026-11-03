import type { Need } from '@kuckuckskind/shared';

const INK = '#4b4033';

/** Kleine Bleistift-Symbole für das Hinweisfeld (keine Zahlen – nur Stärke). */
export function NeedIcon({ need, strength }: { need: Need; strength: number }) {
  const size = 30 + strength * 22;
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role="img"
      aria-label={LABEL[need]}
      style={{ opacity: 0.55 + strength * 0.45 }}
    >
      <g filter="url(#kk-wc)">{FILL[need]}</g>
      <g
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#kk-pencil)"
      >
        {LINE[need]}
      </g>
    </svg>
  );
}

const LABEL: Record<Need, string> = {
  heat: 'Hitze',
  restless: 'Unruhe',
  tired: 'Müdigkeit',
  hunger: 'Hunger',
  bored: 'Langeweile',
};

const FILL: Record<Need, React.ReactNode> = {
  heat: <path d="M20 4 C28 14 32 20 30 27 C28 34 12 34 10 27 C8 20 14 16 20 4 Z" fill="#ef7b4f" />,
  restless: <circle cx="20" cy="20" r="14" fill="#8fb4e8" opacity="0.7" />,
  tired: <path d="M26 6 C14 8 10 22 18 30 C24 35 32 32 34 28 C24 28 18 18 26 6 Z" fill="#b394dc" />,
  hunger: <ellipse cx="20" cy="22" rx="12" ry="9" fill="#e2b56a" />,
  bored: <circle cx="14" cy="28" r="6" fill="#9db59d" />,
};

const LINE: Record<Need, React.ReactNode> = {
  heat: (
    <path d="M20 4 C28 14 32 20 30 27 C28 34 12 34 10 27 C8 20 14 16 20 4 Z M20 18 C24 23 24 28 20 30 C16 28 16 23 20 18" />
  ),
  restless: (
    <path d="M20 20 m0 -2 a2 2 0 1 1 -2 2 a5 5 0 0 1 5 -5 a8 8 0 0 1 8 8 a11 11 0 0 1 -11 11 a13 13 0 0 1 -13 -13" />
  ),
  tired: (
    <>
      <path d="M26 6 C14 8 10 22 18 30 C24 35 32 32 34 28 C24 28 18 18 26 6 Z" />
      <path d="M30 6 h5 l-5 5 h5" />
    </>
  ),
  hunger: (
    <path d="M8 22 C8 14 32 14 32 22 C32 30 8 30 8 22 Z M14 20 l2 2 M22 18 l1 3 M26 23 l2 1" />
  ),
  bored: <path d="M14 28 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M20 28 V8 l10 3" />,
};
