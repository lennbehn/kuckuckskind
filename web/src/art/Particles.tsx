import { useEffect, useState } from 'react';

type Kind = 'hearts' | 'feathers';
interface Particle {
  id: number;
  x: number;
  rot: number;
}

const GLYPH: Record<Kind, React.ReactNode> = {
  hearts: (
    <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden>
      <path
        d="M10 17 C2 11 2 5 6 4 C8 3.5 9.5 5 10 6.5 C10.5 5 12 3.5 14 4 C18 5 18 11 10 17 Z"
        fill="#f08a86"
        stroke="#9c4a47"
        strokeWidth="0.8"
        filter="url(#kk-wc)"
      />
    </svg>
  ),
  feathers: (
    <svg viewBox="0 0 20 30" width="16" height="24" aria-hidden>
      <path
        d="M10 2 C17 8 16 20 10 28 C4 20 3 8 10 2 Z"
        fill="#f8df82"
        stroke="#4b4033"
        strokeWidth="0.8"
        filter="url(#kk-wc)"
      />
      <path d="M10 6 L10 28" stroke="#4b4033" strokeWidth="0.6" />
    </svg>
  ),
};

/** Fliegende Herzchen oder Federn, solange `active`. */
export function Particles({ kind, active }: { kind: Kind; active: boolean }) {
  const [items, setItems] = useState<Particle[]>([]);
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = setInterval(
      () => {
        const p = {
          id: Date.now() + n++,
          x: 20 + Math.random() * 60,
          rot: Math.random() * 60 - 30,
        };
        setItems((xs) => [...xs.slice(-8), p]);
        setTimeout(() => setItems((xs) => xs.filter((q) => q.id !== p.id)), 1800);
      },
      kind === 'hearts' ? 450 : 300,
    );
    return () => clearInterval(id);
  }, [active, kind]);
  return (
    <div className={`particles particles-${kind}`} aria-hidden>
      {items.map((p) => (
        <span key={p.id} style={{ left: `${p.x}%`, ['--rot' as string]: `${p.rot}deg` }}>
          {GLYPH[kind]}
        </span>
      ))}
    </div>
  );
}
