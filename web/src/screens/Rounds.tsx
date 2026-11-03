import { useEffect, useRef } from 'react';
import { holderOf, msLeft, positionAt, type CareKind, type RoomView } from '@kuckuckskind/shared';
import { useGameClient, useServerNow } from '../net/hooks.ts';
import { useSensors, useSensorsState } from '../sensors/hooks.ts';
import { useChickRunner, useRunnerView } from '../game/runnerHost.tsx';
import { useCareInput, type ManualCare } from '../game/useCareInput.ts';
import { Chick, NeedHints } from './game/Chick.tsx';
import { useStable } from './hatching/useStable.ts';

const formatSeconds = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
};

const CARE_LABEL: Record<CareKind, string> = {
  blow: '💨 Pusten',
  rock: '〰️ Wiegen',
  cover: '✋ Zudecken',
  feed: '🍞 Füttern',
  sing: '🎵 Singen',
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
        <div className="egg" aria-hidden>
          🐥
        </div>
        <p className="lead">Gleich beginnt Runde 1 – mit deinem eigenen Küken.</p>
        <div className="countdown">{formatSeconds(left)}</div>
      </div>
    );
  } else if (pos.stage === 'station') {
    const holder = holderOf(owner, pos.round, seating);
    body = (
      <Station
        room={room}
        greeting={
          holder === owner ? (
            <>Dein eigenes Küken, {ownerName}.</>
          ) : (
            <>
              Hallo {nameOf(holder)}! Pass gut auf das Küken von <strong>{ownerName}</strong> auf.
            </>
          )
        }
        round={pos.round}
        left={left}
        paused={pos.paused}
      />
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

/** Eine Station: Küken zeigen, Pflege über Sensoren (oder Ersatz-Tasten) erfassen. */
function Station({
  room,
  greeting,
  round,
  left,
  paused,
}: {
  room: RoomView;
  greeting: React.ReactNode;
  round: number;
  left: number;
  paused: boolean;
}) {
  const runner = useChickRunner();
  const view = useRunnerView(runner);
  const sensors = useSensors();
  const sensorState = useSensorsState();
  const config = useStable(room.config);
  const coverArea = useRef<HTMLDivElement>(null);
  const manual = useRef<ManualCare>({});
  useCareInput(runner, config, coverArea, manual, !paused);

  const kinds = config.care.activeKinds;
  // Ersatz-Tasten für Pflegearten ohne nutzbaren Sensor (Zudecken geht immer per Touch).
  const needsButton = (k: CareKind) =>
    (k === 'blow' && sensorState.mic !== 'ok') ||
    (k === 'rock' && sensorState.motion !== 'ok') ||
    k === 'feed' ||
    k === 'sing';
  const liked =
    !!view && view.input.active.some((k) => room.you.chick?.character.likes.includes(k));

  return (
    <div className="stage station">
      <p className="hint">
        Runde {round + 1} von {room.timeline?.rounds}
      </p>
      <div ref={coverArea} className="chick-area">
        {view && (
          <Chick
            state={view.state}
            config={config}
            hurting={view.hurting}
            liked={liked}
            size={190}
          />
        )}
      </div>
      {view && <NeedHints state={view.state} config={config} />}
      {view?.input.rough && <p className="problem">Zu wild!</p>}
      <p className="lead">{greeting}</p>
      <div className="countdown small">{formatSeconds(left)}</div>
      {!sensorState.enabled && (
        <button className="primary" onClick={() => void sensors.enable()}>
          Antippen, damit ich dich wieder spüre
        </button>
      )}
      <div className="care-buttons">
        {kinds.filter(needsButton).map((k) => (
          <button
            key={k}
            className="care-button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              manual.current = { ...manual.current, [k]: true };
            }}
            onPointerUp={() => (manual.current = { ...manual.current, [k]: false })}
            onPointerCancel={() => (manual.current = { ...manual.current, [k]: false })}
            onContextMenu={(e) => e.preventDefault()}
          >
            {CARE_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
