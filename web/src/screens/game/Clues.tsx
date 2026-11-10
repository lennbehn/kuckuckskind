import { useState, useSyncExternalStore } from 'react';
import type { RoomView } from '@kuckuckskind/shared';
import { GreyFeather } from '../../art/GreyFeather.tsx';
import type { GameClient } from '../../net/GameClient.ts';
import { NEED_ACTION } from './Chick.tsx';

/** Zustand eines bestimmten Clients (im Bot-Modus ist das Handy ein Bot-Client). */
export function useClientState(client: GameClient) {
  return useSyncExternalStore(client.subscribe, client.getState);
}

/** Graue Feder im Nest zu Beginn der Station – Hinweis auf die vorige Station. */
export function FeatherNotice() {
  return (
    <div className="feather-notice" role="status">
      <GreyFeather size={56} />
      <p>
        <strong>Eine graue Feder liegt im Nest …</strong>
        <br />
        Wer hatte mich gerade?
      </p>
    </div>
  );
}

/**
 * Falkenblick: Knopf (wenn die Person, die dieses Handy hält, einen Blick verdient hat),
 * Auswahl des Mitspielers und das laufende Ergebnis.
 */
export function FalconPanel({
  phone,
  room,
  holderId,
  serverNow,
}: {
  /** Client des Handys, das gerade gehalten wird. */
  phone: GameClient;
  /** Raumansicht dieses Handys. */
  room: RoomView;
  holderId: string;
  serverNow: number;
}) {
  const { glance } = useClientState(phone);
  const [choosing, setChoosing] = useState(false);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const glances = room.you.holderGlances ?? 0;
  const active = glance && glance.until > serverNow ? glance : null;

  if (active) {
    const secs = Math.max(0, Math.ceil((active.until - serverNow) / 1000));
    return (
      <div className="falcon-result" role="status">
        <div className="falcon-head">🦅 Falkenblick · noch {secs} s</div>
        <p>
          <strong>{nameOf(active.targetId)}</strong> hält das Küken von{' '}
          {nameOf(active.chickOwnerId)}.
        </p>
        {active.needs.length ? (
          <p>
            Es braucht gerade: <strong>{active.needs.map((n) => NEED_ACTION[n]).join(', ')}</strong>
          </p>
        ) : (
          <p>Es braucht gerade nichts – wer jetzt pflegt, übertreibt.</p>
        )}
        <p className="hint">Schau unauffällig hin: Passt, was {nameOf(active.targetId)} tut?</p>
      </div>
    );
  }
  if (glances < 1) return null;
  if (!choosing) {
    return (
      <button className="falcon-button" onClick={() => setChoosing(true)}>
        🦅 Falkenblick einsetzen{glances > 1 ? ` (${glances})` : ''}
      </button>
    );
  }
  return (
    <div className="falcon-choose">
      <p className="hint">Bei wem willst du kurz hinschauen? Nur du siehst das Ergebnis.</p>
      <div className="falcon-options">
        {room.players
          .filter((p) => p.id !== holderId)
          .map((p) => (
            <button
              key={p.id}
              onClick={() => {
                phone.useGlance(p.id);
                setChoosing(false);
              }}
            >
              {p.name}
            </button>
          ))}
        <button className="link" onClick={() => setChoosing(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
