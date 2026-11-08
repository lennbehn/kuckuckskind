import { useEffect, useState } from 'react';
import type { CareKind, CareMethod, RoomView } from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';
import { useSensors, useSensorsState } from '../sensors/hooks.ts';
import { isStandalone } from '../sensors/platform.ts';
import { BlowStep } from './hatching/BlowStep.tsx';
import { CoverStep } from './hatching/CoverStep.tsx';
import { Egg } from './hatching/Egg.tsx';
import { FallbackButton } from './hatching/FallbackButton.tsx';
import { RockStep } from './hatching/RockStep.tsx';
import type { StepProps } from './hatching/steps.ts';
import { useStable } from './hatching/useStable.ts';

const STEPS: Partial<Record<CareKind, (p: StepProps) => React.ReactNode>> = {
  blow: BlowStep,
  rock: RockStep,
  cover: CoverStep,
};

/**
 * Ausbrüten = Tutorial + Technik-Check am eigenen Ei. Jede geschaffte Pflegeart macht
 * einen Riss. Erst wenn alle fertig sind, schlüpfen alle Küken gleichzeitig.
 */
export function Hatching({ room }: { room: RoomView }) {
  const client = useGameClient();
  const sensors = useSensors();
  const state = useSensorsState();
  const me = room.players.find((p) => p.id === room.you.playerId);
  const kinds = room.config.care.activeKinds;
  // Lokal schon erledigt, bevor der Server es bestätigt – verhindert doppelte Schritte.
  const [pending, setPending] = useState<CareKind[]>([]);
  const done = new Set<CareKind>([...(me?.hatched ?? []), ...pending]);
  const current = kinds.find((k) => !done.has(k));

  // Technik-Check an den Server (Admin-Debug), sobald sich etwas ändert.
  useEffect(() => {
    if (state.enabled) client.sendCalibration(sensors.calibration());
  }, [client, sensors, state]);

  const config = useStable(room.config);
  const onDone = (method: CareMethod) => {
    if (!current) return;
    setPending((p) => [...p, current]);
    client.hatchProgress(current, method);
    navigator.vibrate?.(60);
  };

  const cracks = kinds.filter((k) => done.has(k)).length;

  if (!state.enabled) return <Intro room={room} cracks={cracks} />;

  if (current) {
    const Step = STEPS[current];
    return (
      <main className="paper hatching">
        <Progress total={kinds.length} done={cracks} />
        <Egg cracks={cracks} />
        {Step ? (
          // `key` startet den Schritt neu, wenn die Pflegeart wechselt.
          <Step key={current} config={config} onDone={onDone} />
        ) : (
          <div className="step">
            <h2>Diese Pflege kommt später.</h2>
            <FallbackButton
              label="Hier gedrückt halten"
              holdMs={room.config.hatching.fallbackHoldMs}
              onDone={() => onDone('fallback')}
            />
          </div>
        )}
      </main>
    );
  }

  return <Waiting room={room} cracks={cracks} />;
}

function Progress({ total, done }: { total: number; done: number }) {
  return (
    <p className="hint">
      Riss {Math.min(done + 1, total)} von {total}
    </p>
  );
}

/** Erster Schritt: Ei antippen → Freigaben (Mikrofon, Bewegung, Bildschirm an) + Hinweise. */
function Intro({ room, cracks }: { room: RoomView; cracks: number }) {
  const sensors = useSensors();
  const state = useSensorsState();
  const [dnd, setDnd] = useState(false);
  const ios = sensors.platform === 'ios';

  return (
    <main className="paper hatching">
      <h1 className="small">Dein Ei</h1>
      <Egg cracks={cracks} state="wobble" onTap={() => void sensors.enable()} />
      <p className="lead">
        {state.enabling ? 'Einen Moment …' : 'Tippe auf dein Ei, um es auszubrüten.'}
      </p>
      <section className="card checklist">
        <h2>Vorbereitung</h2>
        <label className="check">
          <input type="checkbox" checked={dnd} onChange={(e) => setDnd(e.target.checked)} />
          „Nicht stören“ ist an {ios ? '(Kontrollzentrum → Fokus)' : '(Schnelleinstellungen)'}
        </label>
        <p className="hint">
          Gleich fragt {ios ? 'Safari' : 'der Browser'} nach Mikrofon
          {ios ? ' und Bewegung' : ''} – bitte erlauben. Es wird nichts aufgenommen.
        </p>
        {ios && !isStandalone() && (
          <p className="hint">
            Tipp: Über Teilen → „Zum Home-Bildschirm“ läuft das Spiel im Vollbild.
          </p>
        )}
        {!state.wakeLockSupported && (
          <p className="hint">
            Dieses Gerät kann den Bildschirm nicht wach halten – bitte die Auto-Sperre ausschalten.
          </p>
        )}
      </section>
      <p className="hint">
        {room.players.length} Eier am Tisch · {room.config.care.activeKinds.length} Pflegearten
      </p>
    </main>
  );
}

/** Eigenes Ei fertig: auf die anderen warten; Host kann notfalls alle schlüpfen lassen. */
function Waiting({ room, cracks }: { room: RoomView; cracks: number }) {
  const client = useGameClient();
  const state = useSensorsState();
  const kinds = room.config.care.activeKinds;
  const missing = room.players.filter((p) => !kinds.every((k) => p.hatched.includes(k)));
  const isHost = room.hostId === room.you.playerId;

  return (
    <main className="paper hatching">
      <h1 className="small">Gleich schlüpft’s!</h1>
      <Egg cracks={cracks} state="wobble" />
      <p className="lead">Dein Ei ist bereit.</p>
      {missing.length > 0 && (
        <p className="note">Warte auf {missing.map((p) => p.name).join(', ')} …</p>
      )}
      <ul className="status-list">
        <li>{state.wakeLock ? '✓ Bildschirm bleibt an' : '• Bildschirm kann ausgehen'}</li>
        <li>{state.mic === 'ok' ? '✓ Mikrofon' : '• Pusten per Taste'}</li>
        <li>{state.motion === 'ok' ? '✓ Bewegung' : '• Wiegen per Taste'}</li>
      </ul>
      {isHost && missing.length > 0 && (
        <button
          className="link"
          onClick={() => {
            if (confirm('Alle Küken jetzt schlüpfen lassen, ohne auf die anderen zu warten?')) {
              client.control('hatchNow');
            }
          }}
        >
          Nicht warten – alle jetzt schlüpfen lassen
        </button>
      )}
    </main>
  );
}
