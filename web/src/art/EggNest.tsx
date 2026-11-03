import { NestBack, NestFront } from './Nest.tsx';

/** Nest mit einem Ei je Spieler (Lobby). */
export function EggNest({ count }: { count: number }) {
  const n = Math.max(1, Math.min(8, count));
  const eggs = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 46 + t * 108;
    const y = 150 - Math.sin(t * Math.PI) * 8;
    return { x, y, r: i % 2 ? -8 : 7 };
  });
  return (
    <svg
      className="egg-nest"
      viewBox="0 20 200 180"
      role="img"
      aria-label={`Nest mit ${count} Eiern`}
    >
      <NestBack />
      {eggs.map((e, i) => (
        <g
          key={i}
          transform={`translate(${e.x} ${e.y}) rotate(${e.r})`}
          className="nest-egg"
          style={{ animationDelay: `${i * 0.3}s` }}
        >
          <path
            d="M0 -24 C14 -24 18 -4 18 4 C18 14 10 18 0 18 C-10 18 -18 14 -18 4 C-18 -4 -14 -24 0 -24 Z"
            fill="url(#kk-shell)"
            filter="url(#kk-wc)"
          />
          <path
            d="M0 -24 C14 -24 18 -4 18 4 C18 14 10 18 0 18 C-10 18 -18 14 -18 4 C-18 -4 -14 -24 0 -24 Z"
            fill="none"
            stroke="#4b4033"
            strokeWidth="1.4"
            filter="url(#kk-pencil)"
          />
        </g>
      ))}
      <NestFront />
    </svg>
  );
}
