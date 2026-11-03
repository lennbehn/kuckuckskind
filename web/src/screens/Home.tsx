import { useState, type FormEvent } from 'react';
import { RoomCodeSchema } from '@kuckuckskind/shared';
import { useGameClient, useGameState } from '../net/hooks.ts';
import { rememberName, rememberedName } from '../net/session.ts';
import { roomCodeFromPath, showPath } from '../routing.ts';
import { ChickArt } from '../art/ChickArt.tsx';
import { MOODS } from '../art/chickParams.ts';

const CLOSED_TEXT = {
  left: 'Du hast den Raum verlassen.',
  kicked: 'Der Host hat dich aus dem Raum genommen.',
  expired: 'Du warst zu lange weg – dein Platz ist frei geworden.',
};

export function Home() {
  const client = useGameClient();
  const { status, closedReason } = useGameState();
  const [codeFromLink] = useState(() => roomCodeFromPath());
  const [name, setName] = useState(rememberedName);
  const [code, setCode] = useState(codeFromLink ?? '');
  const ready = status === 'open' && name.trim().length > 0;
  const codeValid = RoomCodeSchema.safeParse(code).success;

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || !codeValid) return;
    rememberName(name.trim());
    client.joinRoom(code, name.trim());
  };

  const create = () => {
    if (!ready) return;
    rememberName(name.trim());
    showPath('/');
    client.createRoom(name.trim());
  };

  return (
    <main className="paper">
      <h1>Kuckuckskind</h1>
      <ChickArt params={MOODS.happy} size={170} title="Kuckuckskind-Küken im Nest" />
      <p className="lead">Ein Ei für jeden – und einer ist heimlich der Kuckuck.</p>
      {closedReason && <p className="note">{CLOSED_TEXT[closedReason]}</p>}

      <form className="card stack" onSubmit={join}>
        <label className="field">
          <span>Dein Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            autoFocus={!!codeFromLink}
            enterKeyHint="go"
          />
        </label>

        <label className="field">
          <span>Raumcode</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, '')
                  .slice(0, 4),
              )
            }
            placeholder="ABCD"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
          />
        </label>
        <button type="submit" className="primary" disabled={!ready || !codeValid}>
          Beitreten
        </button>

        {!codeFromLink && (
          <>
            <div className="or">oder</div>
            <button type="button" onClick={create} disabled={!ready}>
              Neuen Raum erstellen
            </button>
          </>
        )}
      </form>
    </main>
  );
}
