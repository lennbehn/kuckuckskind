import type { RoomView } from '@kuckuckskind/shared';
import { useGameClient, useServerNow } from '../net/hooks.ts';
import { HatchReveal } from './HatchReveal.tsx';

/**
 * Nach dem Schlüpfen: erst die geheime Rollen-Einblendung, dann wählt jeder geheim,
 * bei wem sein Küken „genau hinschaut“. Diese Station wird lückenlos aufgezeichnet.
 */
export function PeekChoice({ room }: { room: RoomView }) {
  const client = useGameClient();
  const now = useServerNow(200);
  const hatch = room.hatch;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const isHost = room.hostId === room.you.playerId;

  if (hatch && now < hatch.revealEndsAt) {
    return (
      <main className="paper rounds">
        <HatchReveal room={room} now={now} startsAt={hatch.revealEndsAt} />
      </main>
    );
  }

  const options = room.you.peekOptions ?? [];
  const choice = room.you.peekChoice ?? null;
  const secondsLeft = room.peek ? Math.max(0, Math.ceil((room.peek.deadline - now) / 1000)) : 0;

  return (
    <main className="paper">
      <h1 className="small">Genau hinschauen</h1>
      <p className="lead">
        Bei wem soll dein Küken ganz genau aufpassen? Was dort passiert, erzählt es dir später
        haargenau.
      </p>
      <p className="hint">Geheim – niemand erfährt, wen du wählst.</p>
      <ul className="choice-list">
        {options.map((id) => (
          <li key={id}>
            <button
              className={id === choice ? 'primary' : ''}
              aria-pressed={id === choice}
              onClick={() => client.choosePeek(id)}
            >
              {nameOf(id)}
            </button>
          </li>
        ))}
      </ul>
      {choice && <p className="note">Gewählt: {nameOf(choice)}. Warte auf die anderen …</p>}
      {room.you.owl && (
        <section className="card owl-card stack">
          <h2>🦉 Du bist die Eule</h2>
          <p className="hint">
            Wen beobachtest du heimlich? Bei der Heimkehr erfährst du, ob diese Person den Küken
            viel, mittel oder wenig geschadet hat. Ob du es verrätst, entscheidest du.
          </p>
          <ul className="choice-list">
            {room.you.owl.options.map((id) => (
              <li key={id}>
                <button
                  className={id === room.you.owl?.choice ? 'primary' : ''}
                  aria-pressed={id === room.you.owl?.choice}
                  onClick={() => client.chooseOwl(id)}
                >
                  {nameOf(id)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="hint">
        {room.peek?.chosenCount ?? 0} von {room.players.length} haben gewählt · noch {secondsLeft} s
      </p>
      {isHost && (
        <button className="link" onClick={() => client.control('peekNow')}>
          Nicht warten – Rest zufällig wählen
        </button>
      )}
    </main>
  );
}
