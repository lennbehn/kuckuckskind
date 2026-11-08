import { NestBack, NestFront } from './Nest.tsx';

const SHELL =
  'M100 26 C146 26 170 98 170 140 C170 182 140 200 100 200 C60 200 30 182 30 140 C30 98 54 26 100 26 Z';
const CRACKS = [
  'M66 120 l12 -10 l8 12 l10 -9',
  'M118 92 l10 8 l-6 10 l12 6',
  'M58 156 l14 4 l6 -10 l12 8',
  'M122 146 l-8 12 l10 6 l-4 12',
  'M90 66 l6 12 l10 -4',
];
const SPECKLES = [
  [80, 60, 2.5],
  [120, 76, 2],
  [70, 100, 1.6],
  [136, 120, 2.4],
  [96, 136, 1.8],
  [62, 140, 2.2],
  [112, 176, 1.8],
] as const;

export type EggState = 'idle' | 'wobble' | 'hatching';

/** Aquarell-Ei im Nest; Risse je geschaffter Pflege. */
export function EggArt({
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
      viewBox="0 0 200 230"
      role={onTap ? 'button' : 'img'}
      aria-label={onTap ? 'Ei antippen' : `Ei mit ${cracks} Rissen`}
      onClick={onTap}
    >
      <g transform="translate(0 20)">
        <NestBack />
      </g>
      <g className="egg-shell">
        <g filter="url(#kk-wc)">
          <path d={SHELL} fill="url(#kk-shell)" />
          {SPECKLES.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#b89a6a" opacity="0.6" />
          ))}
          <path d={SHELL} fill="none" stroke="#bfa16a" strokeOpacity="0.4" strokeWidth="4" />
        </g>
        <g filter="url(#kk-pencil)" fill="none" stroke="#4b4033" strokeLinecap="round">
          <path d={SHELL} strokeWidth="2" />
          {CRACKS.slice(0, cracks).map((d) => (
            <path key={d} d={d} strokeWidth="2.5" />
          ))}
        </g>
      </g>
      <g transform="translate(0 30)">
        <NestFront />
      </g>
    </svg>
  );
}
