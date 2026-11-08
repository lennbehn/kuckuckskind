import type { ChickParams } from './chickParams.ts';

/**
 * Geometrie des Kükens im viewBox 0 0 200 200. Jede Form hat eine feste Zahl an Punkten,
 * egal welche Werte – so sind Übergänge stufenlos und die Bausteine austauschbar.
 */

type Pt = [number, number];
const f = (v: number) => (Math.round(v * 10) / 10).toString();

/** Geschlossener, glatter Pfad durch Punkte (Catmull-Rom → kubische Bézier). */
export function smoothClosed(pts: readonly Pt[]): string {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n] as Pt;
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + ' Z';
}

export const CENTER: Pt = [100, 110];
const BODY_POINTS = 12;

/** Körper: runder Tropfen, unten breiter; leicht unregelmäßig wie gemalt. */
export function bodyPath(): string {
  const pts: Pt[] = [];
  for (let k = 0; k < BODY_POINTS; k++) {
    const a = (k / BODY_POINTS) * Math.PI * 2;
    const r = 58 * (1 + 0.09 * Math.sin(a) + 0.015 * Math.sin(a * 3 + 1));
    pts.push([CENTER[0] + Math.cos(a) * r * 1.02, CENTER[1] + Math.sin(a) * r]);
  }
  return smoothClosed(pts);
}

export function bellyPath(): string {
  const pts: Pt[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pts.push([100 + Math.cos(a) * 32, 138 + Math.sin(a) * 24]);
  }
  return smoothClosed(pts);
}

/** Auge: geschlossene Form aus 4 Bögen; `eyeSmile` biegt die Unterkante hoch (^). */
export function eyePath(cx: number, cy: number, p: ChickParams, blink: number): string {
  const open = Math.max(0, p.eyeOpen * (1 - blink));
  const rx = 6.5;
  const top = 8 * open + 0.8;
  const bottom = 8 * open * (1 - p.eyeSmile) - p.eyeSmile * 3 + 0.8 * (1 - p.eyeSmile);
  return [
    `M${f(cx - rx)} ${f(cy)}`,
    `C${f(cx - rx)} ${f(cy - top * 0.55)} ${f(cx - rx * 0.55)} ${f(cy - top)} ${f(cx)} ${f(cy - top)}`,
    `C${f(cx + rx * 0.55)} ${f(cy - top)} ${f(cx + rx)} ${f(cy - top * 0.55)} ${f(cx + rx)} ${f(cy)}`,
    `C${f(cx + rx)} ${f(cy + bottom * 0.55)} ${f(cx + rx * 0.55)} ${f(cy + bottom)} ${f(cx)} ${f(cy + bottom)}`,
    `C${f(cx - rx * 0.55)} ${f(cy + bottom)} ${f(cx - rx)} ${f(cy + bottom * 0.55)} ${f(cx - rx)} ${f(cy)}`,
    'Z',
  ].join(' ');
}

/** Braue: Bogen; `side` −1 links, 1 rechts; innen hoch bei browAngle < 0. */
export function browPath(cx: number, cy: number, side: -1 | 1, p: ChickParams): string {
  const y = cy - 15 - p.browRaise * 5;
  const inner: Pt = [cx - side * 6, y + p.browAngle * 4];
  const outer: Pt = [cx + side * 7, y - p.browAngle * 1.5];
  const ctrl: Pt = [cx, y - 3];
  return `M${f(inner[0])} ${f(inner[1])} Q${f(ctrl[0])} ${f(ctrl[1])} ${f(outer[0])} ${f(outer[1])}`;
}

/** Oberschnabel (fest) und Unterschnabel (öffnet sich). */
export function beakTopPath(): string {
  return 'M92 112 Q100 104 108 112 Q100 118 92 112 Z';
}

export function beakBottomPath(p: ChickParams): string {
  const o = p.mouthOpen * 7;
  return `M93 113 Q100 ${f(117 + o)} 107 113 Q100 ${f(115 + o * 0.4)} 93 113 Z`;
}

/** Mundwinkel-Linie unter dem Schnabel: lächelt (nach oben) oder hängt. */
export function mouthPath(p: ChickParams): string {
  const y = 121 + p.mouthOpen * 4;
  const corner = y - p.mouth * 4;
  return `M88 ${f(corner)} Q100 ${f(y + p.mouth * 5)} 112 ${f(corner)}`;
}

/** Schopf: drei Locken, Höhe nach `tuft`. */
export function tuftPaths(p: ChickParams): string[] {
  const h = 6 + p.tuft * 14;
  const lean = (1 - p.tuft) * 8;
  return [-1, 0, 1].map((i) => {
    const x = 100 + i * 7;
    const top: Pt = [x + i * 4 + lean, 56 - h * (i === 0 ? 1 : 0.75)];
    return `M${f(x)} 58 C${f(x - 3)} ${f(56 - h * 0.6)} ${f(top[0] - 6)} ${f(top[1])} ${f(top[0])} ${f(top[1])} C${f(top[0] + 5)} ${f(top[1] + 2)} ${f(top[0] + 2)} ${f(top[1] + 7)} ${f(top[0] - 1)} ${f(top[1] + 5)}`;
  });
}

/** Blattöhrchen (Blattform mit Mittelrippe); Drehung in Grad aus `earDroop`. */
export const leafPath = 'M0 0 C-8 -8 -8 -26 0 -34 C8 -26 8 -8 0 0 Z';
export const leafVein = 'M0 -2 L0 -30';
export const earAngle = (side: -1 | 1, p: ChickParams) => side * (28 + p.earDroop * 45);

/**
 * Flügel als Tropfen, Spitze nach unten-außen (für die linke Seite; rechts gespiegelt).
 * Drehung in Grad aus `wingLift`: positiv hebt den Flügel nach außen.
 */
export const wingPath = 'M0 0 C-12 2 -22 18 -18 38 C-10 34 -2 20 0 0 Z';
export const wingAngle = (side: -1 | 1, p: ChickParams) => -side * (8 + p.wingLift * 40);

/** Träne: Tropfen unter dem Auge. */
export function tearPath(cx: number, cy: number): string {
  return `M${f(cx)} ${f(cy)} C${f(cx - 3)} ${f(cy + 5)} ${f(cx - 3)} ${f(cy + 9)} ${f(cx)} ${f(cy + 9)} C${f(cx + 3)} ${f(cy + 9)} ${f(cx + 3)} ${f(cy + 5)} ${f(cx)} ${f(cy)} Z`;
}

/** Zahl der Pfad-Befehle (für Tests: gleiche Punktzahl in jeder Stimmung). */
export const commandCount = (d: string) => (d.match(/[MLCQZ]/g) ?? []).length;
