import type { RoomView } from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';

/**
 * Abstimmung: jeder wählt vorläufig und kann ändern. Angezeigt wird nur die Zahl der Stimmen,
 * nie wer wen gewählt hat. Der Host zählt aus; bei Gleichstand gibt es eine Stichwahl.
 */
export function Voting({ room }: { room: RoomView }) {
  const client = useGameClient();
  const me = room.you.playerId;
  const isHost = room.hostId === me;
  const voting = room.voting;
  if (!voting) return null;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const mine = room.you.vote ?? null;

  return (
    <main className="paper">
      <h1 className="small">{voting.runoff > 0 ? 'Stichwahl' : 'Wer ist der Kuckuck?'}</h1>
      <p className="lead">
        {voting.runoff > 0
          ? 'Gleichstand! Noch einmal – nur zwischen diesen:'
          : 'Diskutiert und stimmt ab. Ihr könnt eure Wahl jederzeit ändern.'}
      </p>
      <ul className="vote-list">
        {voting.candidates.map((id) => (
          <li key={id}>
            <button
              className={id === mine ? 'primary' : ''}
              aria-pressed={id === mine}
              disabled={id === me}
              onClick={() => client.vote(id === mine ? null : id)}
            >
              <span>
                {nameOf(id)}
                {id === me && ' (du)'}
              </span>
              <span className="votes" aria-label={`${voting.counts[id] ?? 0} Stimmen`}>
                {'●'.repeat(voting.counts[id] ?? 0) || '–'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">
        {voting.votedCount} von {room.players.length} haben abgestimmt
        {mine ? ' · Tippe deine Wahl nochmal an, um sie zurückzuziehen.' : ''}
      </p>
      {isHost && (
        <button
          className="primary big"
          onClick={() => {
            if (confirm('Jetzt auszählen?')) client.control('closeVoting');
          }}
        >
          Auszählen
        </button>
      )}
    </main>
  );
}
