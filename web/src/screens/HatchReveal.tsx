import type { RoomView } from '@kuckuckskind/shared';
import { Egg } from './hatching/Egg.tsx';

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
        <Egg cracks={cracks} state="hatching" />
        <div className="chick-pop" aria-hidden>
          🐣
        </div>
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
      <div className="egg" aria-hidden>
        🐥
      </div>
      <p className="lead">Gleich beginnt Runde 1 – mit deinem eigenen Küken.</p>
      <div className="countdown">{Math.max(0, Math.ceil((startsAt - now) / 1000))}</div>
    </div>
  );
}
