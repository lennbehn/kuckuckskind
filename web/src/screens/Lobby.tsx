import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CARE_KINDS,
  MODULE_IDS,
  type CareKind,
  type ModuleId,
  type RoomView,
} from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';
import { joinUrl } from '../routing.ts';
import { EggNest } from '../art/EggNest.tsx';
import { PresetPicker } from './PresetPicker.tsx';
import { useBots } from '../bots/context.ts';

const CARE_LABELS: Record<CareKind, string> = {
  blow: 'Pusten (Hitze)',
  rock: 'Wiegen (Unruhe)',
  cover: 'Zudecken (Müdigkeit)',
  feed: 'Füttern (Hunger)',
  sing: 'Vorsingen (Langeweile)',
};
/** In der Basisversion gebaut. */
const IMPLEMENTED_CARE: readonly CareKind[] = ['blow', 'rock', 'cover'];

const MODULE_LABELS: Record<ModuleId, string> = {
  fox: 'Fuchs',
  hug: 'Umarmung',
  storm: 'Gewitter',
  contagion: 'Ansteckende Stimmung',
  difficulty: 'Steigender Schwierigkeitsgrad',
  whisper: 'Zuflüstern (KI)',
  family: 'Familienmodus',
  falcon: 'Falkenblick',
  feathers: 'Kuckucksfedern',
  owl: 'Eule',
};

const STATION_CHOICES = [30, 45, 60, 90, 120];

export function Lobby({ room }: { room: RoomView }) {
  const client = useGameClient();
  const bots = useBots();
  const me = room.you.playerId;
  const isHost = room.hostId === me;
  const host = room.players.find((p) => p.id === room.hostId);
  const { minPlayers } = room.config.room;
  const enough = room.players.length >= minPlayers;

  const move = (index: number, delta: number) => {
    const order = room.players.map((p) => p.id);
    const j = index + delta;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j] as string, order[index] as string];
    client.setSeating(order);
  };

  return (
    <main className="paper">
      <h1 className="small">Kuckuckskind</h1>
      <EggNest count={room.players.length} />
      {bots && (
        <p className="note">
          Bot-Modus: {bots.count} Bots spielen mit. Dieses Gerät spielt alle deine Stationen.
        </p>
      )}
      <RoomCode code={room.code} />

      <section className="card">
        <h2>Am Tisch</h2>
        <p className="hint">
          {isHost
            ? 'Bringt die Liste in eure Sitzreihenfolge – im Uhrzeigersinn. Die Handys wandern nach links.'
            : 'Reihenfolge im Uhrzeigersinn, so wie ihr sitzt.'}
        </p>
        <ol className="players">
          {room.players.map((p, i) => (
            <li key={p.id} className={p.connected ? '' : 'away'}>
              <span className="seat">{i + 1}</span>
              <span className="name">
                {p.name}
                {p.id === me && ' (du)'}
                {p.id === room.hostId && <span className="tag">Host</span>}
                {!p.connected && <span className="tag">weg</span>}
              </span>
              {isHost && (
                <span className="actions">
                  <button aria-label="nach oben" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    aria-label="nach unten"
                    onClick={() => move(i, 1)}
                    disabled={i === room.players.length - 1}
                  >
                    ↓
                  </button>
                  {p.id !== me && (
                    <button aria-label={`${p.name} entfernen`} onClick={() => client.kick(p.id)}>
                      ✕
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {isHost ? <HostSettingsCard room={room} /> : <SettingsSummary room={room} />}

      {isHost ? (
        <button className="primary big" disabled={!enough} onClick={() => client.startGame()}>
          {enough ? 'Los geht’s!' : `Noch ${minPlayers - room.players.length} Spieler fehlen`}
        </button>
      ) : (
        <p className="note">Warte, bis {host?.name ?? 'der Host'} startet …</p>
      )}

      <button className="link" onClick={() => client.leaveRoom()}>
        Raum verlassen
      </button>
    </main>
  );
}

function RoomCode({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const url = joinUrl(code);

  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#3b3226', light: '#0000' } })
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

  const share = () => {
    if (navigator.share) void navigator.share({ title: 'Kuckuckskind', url }).catch(() => {});
    else void navigator.clipboard?.writeText(url);
  };

  return (
    <section className="card room-code">
      <div
        className="qr"
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-label={`QR-Code für ${url}`}
      />
      <div>
        <div className="hint">Raumcode</div>
        <div className="code">{code}</div>
        <button className="link" onClick={share}>
          Link teilen
        </button>
      </div>
    </section>
  );
}

function HostSettingsCard({ room }: { room: RoomView }) {
  const client = useGameClient();
  const { config } = room;
  const active = config.care.activeKinds;

  const toggleCare = (kind: CareKind) => {
    const next = active.includes(kind) ? active.filter((k) => k !== kind) : [...active, kind];
    if (next.length > 0) client.updateSettings({ activeKinds: next });
  };

  return (
    <section className="card stack">
      <h2>Einstellungen</h2>
      <PresetPicker room={room} />
      <label className="field">
        <span>Zeit pro Station</span>
        <select
          value={config.timing.stationSeconds}
          onChange={(e) => client.updateSettings({ stationSeconds: Number(e.target.value) })}
        >
          {[...new Set([...STATION_CHOICES, config.timing.stationSeconds])]
            .sort((a, b) => a - b)
            .map((s) => (
              <option key={s} value={s}>
                {s} Sekunden
              </option>
            ))}
        </select>
      </label>

      <label className="field">
        <span>Runden</span>
        <select
          value={config.room.rounds ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            client.updateSettings({ rounds: v === 0 ? null : v });
          }}
        >
          <option value={0}>So viele wie Spieler ({room.players.length})</option>
          {Array.from({ length: config.room.maxPlayers }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Pflegearten</legend>
        {CARE_KINDS.map((kind) => {
          const built = IMPLEMENTED_CARE.includes(kind);
          return (
            <label key={kind} className={`check ${built ? '' : 'later'}`}>
              <input
                type="checkbox"
                checked={active.includes(kind)}
                disabled={!built}
                onChange={() => toggleCare(kind)}
              />
              {CARE_LABELS[kind]}
              {!built && <span className="tag">später</span>}
            </label>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>Module</legend>
        {MODULE_IDS.map((id) => {
          const available = room.availableModules.includes(id);
          return (
            <label key={id} className={`check ${available ? '' : 'later'}`}>
              <input
                type="checkbox"
                checked={config.modules[id].enabled}
                disabled={!available}
                onChange={(e) => client.updateSettings({ modules: { [id]: e.target.checked } })}
              />
              {MODULE_LABELS[id]}
              {!available && <span className="tag">später</span>}
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}

function SettingsSummary({ room }: { room: RoomView }) {
  const { config } = room;
  return (
    <section className="card">
      <h2>Einstellungen</h2>
      {room.preset && (
        <p className="hint">
          Werte: {room.preset.name}
          {room.preset.version ? ` (v${room.preset.version})` : ''}
        </p>
      )}
      <p>
        {config.timing.stationSeconds} s pro Station · {config.room.rounds ?? room.players.length}{' '}
        Runden
      </p>
      <p className="hint">{config.care.activeKinds.map((k) => CARE_LABELS[k]).join(' · ')}</p>
    </section>
  );
}
