/** Graue Kuckucksfeder (Aquarell, wie die übrigen Illustrationen). */
export function GreyFeather({ size = 70 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 40 80"
      width={size * 0.5}
      height={size}
      role="img"
      aria-label="Graue Kuckucksfeder"
    >
      <g filter="url(#kk-wc)">
        <path d="M20 4 C34 18 32 46 20 74 C8 46 6 18 20 4 Z" fill="#8a93a3" />
        <path d="M20 10 C28 22 27 40 20 60 C13 40 12 22 20 10 Z" fill="#b7bfcc" opacity="0.7" />
      </g>
      <g fill="none" stroke="#3b4250" strokeLinecap="round" filter="url(#kk-pencil)">
        <path d="M20 4 C34 18 32 46 20 74 C8 46 6 18 20 4 Z" strokeWidth="1.4" />
        <path d="M20 8 L20 78" strokeWidth="1.2" />
        <path
          d="M20 24 L28 18 M20 34 L29 28 M20 44 L28 39 M20 26 L12 20 M20 36 L11 30 M20 46 L12 41"
          strokeWidth="0.8"
        />
      </g>
    </svg>
  );
}
