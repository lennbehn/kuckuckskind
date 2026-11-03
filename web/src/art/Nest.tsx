import { smoothClosed } from './chickGeometry.ts';

type Pt = [number, number];

const mossPts: Pt[] = [
  [30, 166],
  [44, 156],
  [62, 160],
  [80, 152],
  [100, 158],
  [120, 151],
  [140, 159],
  [158, 154],
  [172, 166],
  [160, 186],
  [130, 194],
  [100, 196],
  [70, 194],
  [40, 186],
];
const MOSS = smoothClosed(mossPts);
const TWIGS = [
  'M24 170 Q60 150 96 160',
  'M176 168 Q140 148 104 158',
  'M34 182 Q90 170 150 186',
  'M60 190 Q110 176 168 178',
];

/** Nest aus Moos und Zweigen: hinterer Rand (vor dem Küken zeichnen) … */
export function NestBack() {
  return (
    <g filter="url(#kk-wc)">
      <ellipse cx="100" cy="164" rx="74" ry="16" fill="#8a6b45" opacity="0.55" />
    </g>
  );
}

/** … und vorderes Moos mit Zweigen (nach dem Küken zeichnen). */
export function NestFront() {
  return (
    <g>
      <g filter="url(#kk-wc)">
        <path d={MOSS} fill="url(#kk-moss)" />
      </g>
      <g
        filter="url(#kk-pencil)"
        fill="none"
        stroke="#5a4630"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        {TWIGS.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d={MOSS} stroke="#3f4d2a" strokeWidth="1.2" opacity="0.7" />
      </g>
    </g>
  );
}
