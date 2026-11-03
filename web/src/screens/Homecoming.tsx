import type { RoomView } from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';

/** Platzhalter bis M4: Heimkehr, Abstimmung und Wertung folgen. */
export function Homecoming({ room }: { room: RoomView }) {
  const client = useGameClient();
  const isHost = room.hostId === room.you.playerId;
  return (
    <main className="paper">
      <h1 className="small">Heimkehr</h1>
      <div className="egg" aria-hidden>
        🐥
      </div>
      <p className="lead">Alle Küken sind wieder zu Hause.</p>
      <p className="hint">Erzählen, Abstimmen und Enthüllen kommen im nächsten Schritt.</p>
      {isHost ? (
        <button className="primary" onClick={() => client.control('abort')}>
          Zurück in die Lobby
        </button>
      ) : (
        <p className="note">Der Host bringt euch zurück in die Lobby.</p>
      )}
    </main>
  );
}
