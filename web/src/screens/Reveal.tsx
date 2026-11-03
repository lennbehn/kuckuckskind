import type { RoomView } from '@kuckuckskind/shared';
import { useGameClient, useServerNow } from '../net/hooks.ts';
import { ChickArt } from '../art/ChickArt.tsx';
import { MOODS } from '../art/chickParams.ts';
import { MiniChick } from '../art/MiniChick.tsx';

const WINNER_TEXT = {
  fosters: 'Die Pflegeeltern gewinnen!',
  cuckoo: 'Der Kuckuck gewinnt!',
  none: 'Niemand gewinnt.',
};

/**
 * Enthüllung: Zum selben Server-Zeitpunkt dreht sich auf allen Handys das Küken des
 * Beschuldigten um. Danach die Wertung mit allen Rollen.
 */
export function Reveal({ room }: { room: RoomView }) {
  const client = useGameClient();
  const now = useServerNow(100);
  const reveal = room.reveal;
  const result = room.result;
  if (!reveal || !result) return null;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const flipped = now >= reveal.at;
  const showResult = now >= reveal.at + room.config.voting.revealAnimationMs;
  const isHost = room.hostId === room.you.playerId;

  let card;
  if (reveal.accusedId) {
    card = (
      <div className={`flip-card ${flipped ? 'flipped' : ''}`}>
        <div className="flip-inner">
          <div className="flip-front">
            <ChickArt params={MOODS.content} back size={170} title="Küken von hinten" />
            <p>Das Küken von {nameOf(reveal.accusedId)} dreht sich um …</p>
          </div>
          <div className="flip-back">
            <ChickArt
              params={
                reveal.accusedRole === 'cuckoo'
                  ? { ...MOODS.content, cuckoo: 1, browAngle: 0.8, mouth: 0.6, eyeSmile: 0.3 }
                  : { ...MOODS.worried, tears: 0.4 }
              }
              size={170}
              title={reveal.accusedRole === 'cuckoo' ? 'Kuckucks-Küken' : 'Küken'}
            />
            <p>
              <strong>{nameOf(reveal.accusedId)}</strong>{' '}
              {reveal.accusedRole === 'cuckoo' ? 'ist der Kuckuck!' : 'ist kein Kuckuck.'}
            </p>
          </div>
        </div>
      </div>
    );
  } else {
    card = (
      <p className="lead">
        {reveal.reason === 'no_cuckoo'
          ? 'Diesmal gab es keinen Kuckuck.'
          : reveal.reason === 'tie'
            ? 'Ihr konntet euch nicht einigen – niemand wird beschuldigt.'
            : 'Niemand hat abgestimmt.'}
      </p>
    );
  }

  return (
    <main className="paper">
      <h1 className="small">Enthüllung</h1>
      {card}
      {showResult && (
        <section className="card result">
          <h2 className="winner">{WINNER_TEXT[result.winner]}</h2>
          <p className="hint">
            {result.cuckooCaught ? 'Kuckuck enttarnt' : 'Kuckuck unentdeckt'} ·{' '}
            {result.allSurvived ? 'alle Küken haben überlebt' : 'nicht alle Küken haben überlebt'}
            {result.onlyCuckooHappy && ' · nur das Kuckucks-Küken ist glücklich'}
          </p>
          <ul className="chick-list">
            {room.players.map((p) => {
              const c = result.chicks[p.id];
              return (
                <li key={p.id}>
                  <span className="who">
                    <MiniChick
                      wellbeing={c?.wellbeing}
                      alive={c?.alive}
                      params={
                        result.roles[p.id] === 'cuckoo'
                          ? { ...MOODS.content, cuckoo: 1 }
                          : undefined
                      }
                    />
                    {p.name}{' '}
                    {result.roles[p.id] === 'cuckoo' && <span className="tag">Kuckuck</span>}
                  </span>
                  <span>
                    {!c?.alive
                      ? 'nicht mehr da'
                      : result.happy.includes(p.id)
                        ? 'glücklich'
                        : 'unglücklich'}{' '}
                    {c && `· ${Math.round(c.wellbeing * 100)} %`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {showResult &&
        (isHost ? (
          <button className="primary big" onClick={() => client.control('abort')}>
            Neue Partie
          </button>
        ) : (
          <p className="note">Der Host startet eine neue Partie.</p>
        ))}
    </main>
  );
}
