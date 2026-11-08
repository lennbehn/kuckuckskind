/**
 * Gemeinsame SVG-Definitionen (einmal im Dokument): Aquarell- und Bleistift-Filter,
 * Farbverläufe für Bedürfnisse. Alle Illustrationen verweisen per url(#kk-…) darauf.
 *
 * Aquarell = Ränder per feTurbulence + feDisplacementMap verwischt, dazu eine fein
 * gesprenkelte Deckkraft als Pigment-Textur.
 */
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <filter
          id="kk-wc"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves="3"
            seed="4"
            result="n1"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n1"
            scale="6"
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="2"
            seed="9"
            result="n2"
          />
          <feColorMatrix
            in="n2"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.3"
            result="grain"
          />
          <feComposite in="d" in2="grain" operator="in" />
        </filter>
        <filter id="kk-pencil" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="1"
            seed="2"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="1.6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        {(
          [
            ['heat', '#e0563c'],
            ['tired', '#8e5cc4'],
            ['restless', '#4f86d6'],
            ['hunger', '#d39a35'],
            ['bored', '#7d9a7d'],
          ] as const
        ).map(([id, color]) => (
          <radialGradient key={id} id={`kk-tint-${id}`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
        <radialGradient id="kk-body" cx="40%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#fff7d6" />
          <stop offset="55%" stopColor="#f8df82" />
          <stop offset="100%" stopColor="#e9c55c" />
        </radialGradient>
        <radialGradient id="kk-body-cuckoo" cx="40%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#dfe3ea" />
          <stop offset="60%" stopColor="#9aa5b8" />
          <stop offset="100%" stopColor="#6f7a8f" />
        </radialGradient>
        <radialGradient id="kk-shell" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="65%" stopColor="#f2e3c2" />
          <stop offset="100%" stopColor="#dcc69b" />
        </radialGradient>
        <linearGradient id="kk-moss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fb36a" />
          <stop offset="100%" stopColor="#5f7a3e" />
        </linearGradient>
      </defs>
    </svg>
  );
}
