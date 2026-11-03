import { useId } from 'react';
import type { Need } from '@kuckuckskind/shared';
import type { ChickParams } from './chickParams.ts';
import {
  beakBottomPath,
  beakTopPath,
  bellyPath,
  bodyPath,
  browPath,
  earAngle,
  eyePath,
  leafPath,
  leafVein,
  mouthPath,
  tearPath,
  tuftPaths,
  wingAngle,
  wingPath,
} from './chickGeometry.ts';
import { NestBack, NestFront } from './Nest.tsx';

const BODY = bodyPath();
const BELLY = bellyPath();
const INK = '#4b4033';

/** Wo die Farbe je Bedürfnis im Küken sitzt. */
const TINT_SPOT: Record<Need, { cx: number; cy: number; rx: number; ry: number }> = {
  heat: { cx: 100, cy: 105, rx: 55, ry: 45 },
  tired: { cx: 100, cy: 70, rx: 60, ry: 40 },
  restless: { cx: 100, cy: 150, rx: 62, ry: 34 },
  hunger: { cx: 100, cy: 140, rx: 40, ry: 30 },
  bored: { cx: 70, cy: 110, rx: 40, ry: 50 },
};

export interface ChickArtProps {
  params: ChickParams;
  tints?: Partial<Record<Need, number>>;
  /** 0 = Augen offen, 1 = Lidschlag. */
  blink?: number;
  size?: number | string;
  /** Von hinten (vor dem Umdrehen bei der Enthüllung). */
  back?: boolean;
  nest?: boolean;
  /** Flügel zappeln (Unruhe). */
  jitter?: boolean;
  title?: string;
}

/**
 * Aquarell-Küken (Platzhalter nach Variante B, bis die SVGs aus Claude Design kommen):
 * zartgelb, Blattöhrchen, Schopf, Bleistiftlinien, im Nest. Ebenen und Namen folgen
 * docs/kueken-bausteine.md, damit die finalen Bausteine 1:1 ersetzt werden können.
 */
export function ChickArt({
  params: p,
  tints = {},
  blink = 0,
  size = 200,
  back = false,
  nest = true,
  jitter = false,
  title,
}: ChickArtProps) {
  const clip = useId();
  const fill = p.cuckoo > 0.5 ? 'url(#kk-body-cuckoo)' : 'url(#kk-body)';
  return (
    <svg
      className="kk-chick"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? 'Küken'}
    >
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>
      {nest && <NestBack />}
      <g className="kk-breathe" data-part="ck-chick">
        {/* Blattöhrchen */}
        <g data-part="ck-ears">
          {([-1, 1] as const).map((side) => (
            <g
              key={side}
              transform={`translate(${100 + side * 24} 66) rotate(${earAngle(side, p)})`}
            >
              <path d={leafPath} fill="#9bbf6a" filter="url(#kk-wc)" />
              <path
                d={leafPath}
                fill="none"
                stroke={INK}
                strokeWidth="1.2"
                filter="url(#kk-pencil)"
              />
              <path d={leafVein} stroke="#5f7a3e" strokeWidth="1" />
            </g>
          ))}
        </g>
        {/* Körper mit Aquarell-Lasur */}
        <g data-part="ck-body" filter="url(#kk-wc)">
          <path d={BODY} fill={fill} />
          {!back && <path d={BELLY} fill="#fff8e0" opacity={0.7 - p.cuckoo * 0.4} />}
          {p.cuckoo > 0 && !back && (
            <g
              opacity={p.cuckoo}
              stroke="#4c5566"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            >
              <path d="M80 132 Q100 138 120 132" />
              <path d="M78 144 Q100 150 122 144" />
              <path d="M82 156 Q100 161 118 156" />
            </g>
          )}
          <g clipPath={`url(#${clip})`}>
            {(Object.entries(tints) as [Need, number][]).map(([need, t]) =>
              t > 0 ? (
                <ellipse
                  key={need}
                  {...TINT_SPOT[need]}
                  fill={`url(#kk-tint-${need})`}
                  opacity={t * 0.75}
                />
              ) : null,
            )}
          </g>
          {/* Pigment sammelt sich am Rand */}
          <path d={BODY} fill="none" stroke="#c99a2e" strokeOpacity="0.35" strokeWidth="4" />
        </g>
        <path
          data-part="ck-outline"
          d={BODY}
          fill="none"
          stroke={INK}
          strokeWidth="1.8"
          filter="url(#kk-pencil)"
        />
        {/* Flügel an den Körperseiten, vor dem Körperrand */}
        <g data-part="ck-wings" className={jitter ? 'kk-jitter' : undefined}>
          {([-1, 1] as const).map((side) => (
            <g
              key={side}
              transform={`translate(${100 + side * 50} 116) rotate(${wingAngle(side, p)}) scale(${-side} 1)`}
            >
              <path
                d={wingPath}
                fill={p.cuckoo > 0.5 ? '#7d889c' : '#efcd62'}
                filter="url(#kk-wc)"
              />
              <path
                d={wingPath}
                fill="none"
                stroke={INK}
                strokeWidth="1.4"
                filter="url(#kk-pencil)"
              />
            </g>
          ))}
        </g>
        {/* Schopf */}
        <g
          data-part="ck-tuft"
          fill="none"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#kk-pencil)"
        >
          {tuftPaths(p).map((d) => (
            <path key={d.slice(0, 12)} d={d} />
          ))}
        </g>
        {back ? (
          <path
            d="M70 90 Q100 70 130 90"
            fill="none"
            stroke={INK}
            strokeOpacity="0.3"
            strokeWidth="2"
          />
        ) : (
          <Face p={p} blink={blink} />
        )}
      </g>
      {nest && <NestFront />}
    </svg>
  );
}

function Face({ p, blink }: { p: ChickParams; blink: number }) {
  return (
    <g data-part="ck-face">
      <g data-part="ck-cheeks" opacity={p.blush} filter="url(#kk-wc)">
        <ellipse cx="72" cy="114" rx="10" ry="6" fill="#f08a86" />
        <ellipse cx="128" cy="114" rx="10" ry="6" fill="#f08a86" />
      </g>
      <g data-part="ck-eyes" fill={INK}>
        <path d={eyePath(82, 98, p, blink)} />
        <path d={eyePath(118, 98, p, blink)} />
        <g fill="#fff" opacity={Math.max(0, p.eyeOpen * (1 - p.eyeSmile) * (1 - blink) - 0.2)}>
          <circle cx="84" cy="95" r="1.8" />
          <circle cx="120" cy="95" r="1.8" />
        </g>
      </g>
      <g data-part="ck-brows" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d={browPath(82, 98, -1, p)} />
        <path d={browPath(118, 98, 1, p)} />
      </g>
      <g data-part="ck-beak">
        <path d={beakBottomPath(p)} fill="#d9743a" stroke={INK} strokeWidth="1" />
        <path d={beakTopPath()} fill="#f09a4a" stroke={INK} strokeWidth="1.2" />
      </g>
      <path
        data-part="ck-mouth"
        d={mouthPath(p)}
        fill="none"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <g data-part="ck-tears" opacity={p.tears} fill="#8cc4ea" stroke="#5b8db5" strokeWidth="0.8">
        <path className="kk-tear" d={tearPath(78, 106)} />
        <path className="kk-tear kk-tear-late" d={tearPath(122, 106)} />
      </g>
    </g>
  );
}
