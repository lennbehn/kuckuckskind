/** Platzhalter-Ei bis zu den Aquarell-SVGs (M5): Risse je geschaffter Pflege. */
const CRACKS = [
  'M70 118 l12 -10 l8 12 l10 -9',
  'M118 92 l10 8 l-6 10 l12 6',
  'M60 160 l14 4 l6 -10 l12 8',
  'M120 150 l-8 12 l10 6 l-4 12',
  'M90 70 l6 12 l10 -4',
];

export type EggState = 'idle' | 'wobble' | 'hatching';

export function Egg({
  cracks,
  state = 'idle',
  onTap,
}: {
  cracks: number;
  state?: EggState;
  onTap?: () => void;
}) {
  return (
    <svg
      className={`egg-svg egg-${state}`}
      viewBox="0 0 200 240"
      role={onTap ? 'button' : 'img'}
      aria-label={onTap ? 'Ei antippen' : `Ei mit ${cracks} Rissen`}
      onClick={onTap}
    >
      <defs>
        <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
        <radialGradient id="shell" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="70%" stopColor="#f3e6c8" />
          <stop offset="100%" stopColor="#e2cfa6" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="225" rx="62" ry="10" fill="#7e8f55" opacity="0.25" />
      <g filter="url(#pencil)">
        <path
          d="M100 18 C150 18 178 100 178 150 C178 200 144 228 100 228 C56 228 22 200 22 150 C22 100 50 18 100 18 Z"
          fill="url(#shell)"
          stroke="#6b5d4a"
          strokeWidth="2.5"
        />
        {CRACKS.slice(0, cracks).map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="#3b3226"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
