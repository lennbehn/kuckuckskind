import { useEffect, useRef } from 'react';
import { holderOf, msLeft, positionAt, type RoomView } from '@kuckuckskind/shared';
import { useGameClient, useServerNow } from '../net/hooks.ts';

const formatSeconds = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
};

/**
 * Rundentakt auf DIESEM Handy. Das Handy gehört dem Spieler `you` (sein Küken);
 * wer es gerade in der Hand hat, ergibt sich nur aus Sitzordnung + Runde.
 */
export function Rounds({ room }: { room: RoomView }) {
  const client = useGameClient();
  const now = useServerNow(100);
  const tl = room.timeline;
  const owner = room.you.playerId;
  const seating = room.players.map((p) => p.id);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const pos = tl ? positionAt(tl, now) : null;
  const left = tl ? msLeft(tl, now) : 0;

  // Beim „Weiter!“ kurz vibrieren (Android; iPhone kann das im Browser nicht).
  const lastStage = useRef<string | null>(null);
  useEffect(() => {
    const key = pos ? `${pos.stage}:${'round' in pos ? pos.round : ''}` : null;
    if (key !== lastStage.current && pos?.stage === 'handover')
      navigator.vibrate?.([200, 100, 200]);
    lastStage.current = key;
  }, [pos]);

  if (!tl || !pos) return null;
  const isHost = room.hostId === owner;
  const ownerName = nameOf(owner);

  let body;
  if (pos.stage === 'before') {
    body = (
      <div className="stage">
        <p className="lead">Gleich geht’s los …</p>
        <div className="countdown">{formatSeconds(left)}</div>
      </div>
    );
  } else if (pos.stage === 'station') {
    const holder = holderOf(owner, pos.round, seating);
    body = (
      <div className="stage">
        <p className="hint">
          Runde {pos.round + 1} von {tl.rounds}
        </p>
        <div className="egg" aria-hidden>
          🐣
        </div>
        <p className="lead">
          {holder === owner ? (
            <>Dein eigenes Küken, {ownerName}.</>
          ) : (
            <>
              Hallo {nameOf(holder)}! Pass gut auf das Küken von <strong>{ownerName}</strong> auf.
            </>
          )}
        </p>
        <div className="countdown">{formatSeconds(left)}</div>
      </div>
    );
  } else if (pos.stage === 'handover') {
    const next = holderOf(owner, pos.nextRound, seating);
    body = (
      <div className="stage next">
        <div className="weiter">Weiter!</div>
        <p className="lead">
          Gib mich nach links an <strong>{nameOf(next)}</strong>.
        </p>
        <div className="countdown small">{formatSeconds(left)}</div>
      </div>
    );
  } else {
    body = (
      <div className="stage">
        <p className="lead">Alle Küken fliegen nach Hause …</p>
      </div>
    );
  }

  return (
    <main className="paper rounds">
      {body}
      {pos.paused && <div className="paused">Pause</div>}
      {isHost && (
        <nav className="host-controls" aria-label="Host-Steuerung">
          {pos.paused ? (
            <button onClick={() => client.control('resume')}>Weiter</button>
          ) : (
            <button onClick={() => client.control('pause')}>Pause</button>
          )}
          <button onClick={() => client.control('skip')} disabled={pos.paused}>
            Überspringen
          </button>
          <button
            onClick={() => {
              if (confirm('Partie abbrechen und zurück in die Lobby?')) client.control('abort');
            }}
          >
            Abbrechen
          </button>
        </nav>
      )}
    </main>
  );
}
