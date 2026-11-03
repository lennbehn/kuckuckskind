import { useState } from 'react';
import { isMuted, setMuted } from '../art/sound.ts';

/** Kleiner Lautsprecher-Schalter oben rechts. */
export function SoundToggle() {
  const [muted, setState] = useState(isMuted);
  return (
    <button
      className="sound-toggle"
      aria-label={muted ? 'Töne einschalten' : 'Töne ausschalten'}
      aria-pressed={!muted}
      onClick={() => {
        setMuted(!muted);
        setState(!muted);
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path
          d="M4 9 H8 L13 5 V19 L8 15 H4 Z"
          fill="#f6dc7a"
          stroke="#4b4033"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {muted ? (
          <path
            d="M16 9 L21 15 M21 9 L16 15"
            stroke="#4b4033"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16 9 Q18.5 12 16 15 M18.5 6.5 Q23 12 18.5 17.5"
            fill="none"
            stroke="#4b4033"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}
