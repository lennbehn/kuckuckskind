import type { RoomView } from '@kuckuckskind/shared';
import { Egg } from './hatching/Egg.tsx';
import { ChickArt } from '../art/ChickArt.tsx';
import { MOODS } from '../art/chickParams.ts';

/**
 * Zwischen „alle Eier fertig“ und Runde 1: gemeinsames Schlüpfen (zum selben Server-Zeitpunkt
 * auf allen Handys), dann kurz die geheime Rolle, danach verdeckt.
 */
export function HatchReveal({
  room,
  now,
  startsAt,
}: {
  room: RoomView;
  now: number;
  startsAt: number;
}) {
  const hatch = room.hatch;
  const cracks = room.config.care.activeKinds.length;
  const animEnd = hatch ? hatch.at + room.config.hatching.hatchAnimationMs : 0;

  if (hatch && now < hatch.at) {
    return (
      <div className="stage">
        <Egg cracks={cracks} state="wobble" />
        <p className="lead">Alle Eier sind bereit …</p>
      </div>
    );
  }
  if (hatch && now < animEnd) {
    return (
      <div className="stage">
        {/* Erst wackelt das Ei, dann springt die Schale auf und das Küken erscheint. */}
        {now < hatch.at + room.config.hatching.hatchAnimationMs * 0.45 ? (
          <Egg cracks={cracks} state="hatching" />
        ) : (
          <div className="chick-pop">
            <ChickArt params={MOODS.happy} size={220} title="Frisch geschlüpftes Küken" />
            {(['left', 'right'] as const).map((side) => (
              <svg key={side} className={`shell shell-${side}`} viewBox="0 0 60 40" aria-hidden>
                <path
                  d="M2 38 C2 18 14 4 30 4 C46 4 58 18 58 38 L50 30 L42 38 L34 28 L26 38 L18 28 L10 38 Z"
                  fill="url(#kk-shell)"
                  stroke="#4b4033"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  transform={side === 'left' ? undefined : 'scale(-1 1) translate(-60 0)'}
                />
              </svg>
            ))}
          </div>
        )}
        <p className="lead">Sie schlüpfen!</p>
      </div>
    );
  }
  if (hatch && now < hatch.revealEndsAt && room.you.role) {
    const cuckoo = room.you.role === 'cuckoo';
    return (
      <div className="stage role-card">
        <p className="hint">Geheim – nur für dich:</p>
        <h2 className="role">{cuckoo ? 'Du bist der Kuckuck.' : 'Du bist Pflegeeltern.'}</h2>
        <p className="lead">
          {cuckoo
            ? 'Sabotiere leise und lass dich nicht erwischen. Dein eigenes Küken soll glücklich sein.'
            : 'Pass gut auf jedes Küken auf – und finde heraus, wer der Kuckuck ist.'}
        </p>
      </div>
    );
  }
  return (
    <div className="stage">
      <ChickArt params={MOODS.content} size={180} title="Dein Küken" />
      <p className="lead">Gleich beginnt Runde 1 – mit deinem eigenen Küken.</p>
      <div className="countdown">{Math.max(0, Math.ceil((startsAt - now) / 1000))}</div>
    </div>
  );
}
