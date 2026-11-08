import { useState } from 'react';
import { resolveConfig, type ChickState } from '@kuckuckskind/shared';
import { ChickArt } from '../art/ChickArt.tsx';
import { MOODS, type Mood } from '../art/chickParams.ts';
import { EggArt } from '../art/EggArt.tsx';
import { EggNest } from '../art/EggNest.tsx';
import { NeedIcon } from '../art/NeedIcon.tsx';
import { Chick, NeedHints } from './game/Chick.tsx';

const config = resolveConfig();

const MOOD_LABEL: Record<Mood, string> = {
  content: 'zufrieden',
  happy: 'glücklich',
  worried: 'besorgt',
  sad: 'traurig',
  crying: 'weint',
  sleepy: 'müde',
  hot: 'heiß',
  jittery: 'unruhig',
  gone: 'nicht mehr da',
};

/**
 * Galerie unter /galerie: alle Stimmungen, Bedürfnis-Farben, Ei, Nest und Symbole –
 * zum Prüfen des Looks und als Vergleich für die Bausteine aus Claude Design.
 */
export function Gallery() {
  const [w, setW] = useState(1);
  const [heat, setHeat] = useState(0.1);
  const [tired, setTired] = useState(0.1);
  const [restless, setRestless] = useState(0.1);
  const [hurting, setHurting] = useState(false);
  const [liked, setLiked] = useState(false);
  const state: ChickState = {
    needs: { heat, restless, tired, hunger: 0, bored: 0 },
    urgentMs: { heat: 0, restless: 0, tired: 0, hunger: 0, bored: 0 },
    wellbeing: w,
    alive: w > 0,
    stationLoss: 0,
  };
  const slider = (label: string, v: number, set: (n: number) => void) => (
    <label className="field">
      <span>
        {label}: {Math.round(v * 100)} %
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={v}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
  return (
    <main className="paper gallery">
      <h1 className="small">Küken-Galerie</h1>
      <section className="card stack">
        <h2>Lebendig</h2>
        <Chick state={state} config={config} hurting={hurting} liked={liked} size={240} />
        <NeedHints state={state} config={config} />
        {slider('Befinden', w, setW)}
        {slider('Hitze', heat, setHeat)}
        {slider('Müdigkeit', tired, setTired)}
        {slider('Unruhe', restless, setRestless)}
        <label className="check">
          <input type="checkbox" checked={hurting} onChange={(e) => setHurting(e.target.checked)} />{' '}
          Schaden
        </label>
        <label className="check">
          <input type="checkbox" checked={liked} onChange={(e) => setLiked(e.target.checked)} />{' '}
          Lieblingspflege
        </label>
      </section>
      <section className="card">
        <h2>Stimmungen</h2>
        <div className="gallery-grid">
          {(Object.keys(MOODS) as Mood[]).map((m) => (
            <figure key={m}>
              <ChickArt params={MOODS[m]} size={120} />
              <figcaption>{MOOD_LABEL[m]}</figcaption>
            </figure>
          ))}
          <figure>
            <ChickArt params={{ ...MOODS.content, cuckoo: 1 }} size={120} />
            <figcaption>Kuckuck</figcaption>
          </figure>
          <figure>
            <ChickArt params={MOODS.content} back size={120} />
            <figcaption>von hinten</figcaption>
          </figure>
        </div>
      </section>
      <section className="card">
        <h2>Ei, Nest, Symbole</h2>
        <div className="gallery-grid">
          {[0, 1, 3].map((c) => (
            <figure key={c}>
              <div style={{ width: 110 }}>
                <EggArt cracks={c} />
              </div>
              <figcaption>{c} Risse</figcaption>
            </figure>
          ))}
        </div>
        <EggNest count={5} />
        <div className="need-hints">
          {(['heat', 'restless', 'tired', 'hunger', 'bored'] as const).map((n) => (
            <NeedIcon key={n} need={n} strength={0.6} />
          ))}
        </div>
      </section>
    </main>
  );
}
