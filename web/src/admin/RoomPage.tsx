import { useEffect, useState } from 'react';
import {
  NEED_FOR_CARE,
  holderOf,
  msLeft,
  positionAt,
  type PresetSummary,
  type RoomDebug,
} from '@kuckuckskind/shared';
import { adminApi } from './api.ts';
import { navigate } from './nav.ts';
import { ENUM_LABEL } from './configForm.ts';
import { PHASE_LABEL } from './labels.ts';

/**
 * Live-Debug eines Raums (aktualisiert jede Sekunde): Takt, Spieler mit Technik-Check,
 * laufende Sensorpegel je Gerät, Werte jedes Kükens, Ereignislog. Solange diese Seite
 * offen ist, senden die Handys ihre Messwerte.
 */
export function RoomPage({ code }: { code: string }) {
  const [data, setData] = useState<{ debug: RoomDebug; offset: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = () =>
      adminApi<RoomDebug>(`/api/admin/rooms/${code}`).then(
        (debug) => {
          if (!alive) return;
          setData({ debug, offset: debug.serverTime - Date.now() });
          setError(null);
        },
        (e: Error) => alive && setError(e.message),
      );
    void load();
    const id = setInterval(load, 1000);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [code]);

  if (!data)
    return (
      <section className="card">
        {error ? <p className="problem">{error}</p> : <p>Lade …</p>}
      </section>
    );
  const { debug: d, offset } = data;
  const serverNow = now + offset;
  const nameOf = (id: string | null) =>
    id ? (d.players.find((p) => p.id === id)?.name ?? id) : '–';
  const seating = d.players.map((p) => p.id);
  const pos = d.timeline ? positionAt(d.timeline, serverNow) : null;
  const round = pos && 'round' in pos ? pos.round : null;
  const kinds = d.config.care.activeKinds;
  const noiseThreshold = d.config.sensors.blow.thresholdOverNoiseDb;
  const rock = d.config.sensors.rock;

  return (
    <>
      <section className="card admin-room-head">
        <div>
          <h2>Raum {d.code}</h2>
          <p>
            <strong>{PHASE_LABEL[d.phase]}</strong>
            {pos && d.timeline && (
              <>
                {' · '}
                {pos.stage === 'station' && `Runde ${pos.round + 1}/${d.timeline.rounds}, Station`}
                {pos.stage === 'handover' && `Weitergabe nach Runde ${pos.round + 1}`}
                {pos.stage === 'before' && 'vor Runde 1'}
                {pos.stage === 'done' && 'Takt beendet'}
                {pos.stage !== 'done' &&
                  ` · noch ${Math.ceil(msLeft(d.timeline, serverNow) / 1000)} s`}
                {pos.paused && ' · PAUSE'}
              </>
            )}
          </p>
          <p className="hint">
            Konfiguration:{' '}
            {d.preset
              ? `${d.preset.name}${d.preset.version ? ` v${d.preset.version}` : ''}`
              : 'Standardwerte'}{' '}
            · Host: {nameOf(d.hostId)}
            {error && <span className="problem"> · {error}</span>}
          </p>
        </div>
        <label className="check secret-toggle">
          <input type="checkbox" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} />
          Geheimes zeigen (Rollen, Spick-Wahl, Stimmen)
        </label>
      </section>

      {d.phase === 'lobby' && <RoomConfigCard code={d.code} />}

      <section className="card">
        <h2>Spieler & Geräte</h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Spieler</th>
                {secrets && <th>Geheim</th>}
                <th>Gerät</th>
                <th>Mikrofon</th>
                <th>Bewegung</th>
                <th>Touch / Pflege</th>
                <th>Küken</th>
              </tr>
            </thead>
            <tbody>
              {d.players.map((p) => {
                const cal = p.calibration;
                const lv = p.levels && serverNow - p.levels.at < 3000 ? p.levels : null;
                const noise = cal?.mic.noiseDb;
                const holder = round !== null ? holderOf(p.id, round, seating) : null;
                return (
                  <tr key={p.id} className={p.connected ? '' : 'away'}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="hint">
                        {p.connected
                          ? 'verbunden'
                          : `weg seit ${Math.round((serverNow - p.lastSeenAt) / 1000)} s`}
                        {d.phase === 'hatching' && ` · ${p.hatched.length}/${kinds.length} Risse`}
                        {holder && holder !== p.id && ` · Handy bei ${nameOf(holder)}`}
                      </div>
                    </td>
                    {secrets && (
                      <td>
                        {p.role === 'cuckoo' ? (
                          <span className="tag cuckoo">Kuckuck</span>
                        ) : p.role ? (
                          'Pflegeeltern'
                        ) : (
                          '–'
                        )}
                        <div className="hint">Spickt bei: {nameOf(p.peekChoice)}</div>
                        {d.phase === 'voting' && (
                          <div className="hint">Stimme: {nameOf(p.vote)}</div>
                        )}
                      </td>
                    )}
                    <td>
                      {cal ? (
                        <>
                          {cal.platform}
                          {cal.standalone && ' · PWA'}
                          <div className="hint">
                            {cal.wakeLock ? 'Bildschirm bleibt an' : 'kein Wake Lock'}
                          </div>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td>
                      {cal?.mic.status ?? '–'}
                      {noise !== undefined && (
                        <div className="hint">
                          Ruhe {noise} dB · Spitze {cal?.mic.peakDb ?? '–'} dB
                        </div>
                      )}
                      {lv?.micDb != null && (
                        <Meter
                          value={lv.micDb}
                          min={(noise ?? -70) - 5}
                          max={(noise ?? -70) + noiseThreshold + 15}
                          mark={(noise ?? -70) + noiseThreshold}
                          label={`${Math.round(lv.micDb)} dB`}
                        />
                      )}
                    </td>
                    <td>
                      {cal?.motion.status ?? '–'}
                      {cal?.motion.scale !== undefined && (
                        <div className="hint">Empfindlichkeit ×{cal.motion.scale}</div>
                      )}
                      {lv?.motion != null && (
                        <Meter
                          value={lv.motion * (cal?.motion.scale ?? 1)}
                          min={0}
                          max={rock.harshAbove * 1.3}
                          mark={rock.harshAbove}
                          band={[rock.gentleMin, rock.gentleMax]}
                          label={`${lv.motion.toFixed(1)} m/s²`}
                        />
                      )}
                    </td>
                    <td>
                      {cal?.cover.minTouchPoints !== undefined && (
                        <div className="hint">
                          ab {cal.cover.minTouchPoints} Fingern (max. {cal.cover.maxTouches})
                        </div>
                      )}
                      {lv && (
                        <div>
                          {lv.touches} Finger ·{' '}
                          {lv.care.length
                            ? lv.care.map((k) => ENUM_LABEL[k] ?? k).join(', ')
                            : 'keine Pflege'}
                          {lv.rough && <span className="problem"> · zu wild</span>}
                          {!lv.visible && <span className="problem"> · im Hintergrund</span>}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.chick ? (
                        <>
                          <Meter
                            value={p.chick.wellbeing}
                            min={0}
                            max={1}
                            mark={d.config.scoring.happyMin}
                            label={`${p.chick.alive ? '' : '† '}${Math.round(p.chick.wellbeing * 100)} %`}
                          />
                          <div className="needs">
                            {kinds.map((k) => {
                              const n = NEED_FOR_CARE[k];
                              const v = p.chick?.needs[n] ?? 0;
                              return (
                                <span
                                  key={k}
                                  title={`${n}: ${Math.round(v * 100)} %`}
                                  className={v >= 0.6 ? 'urgent' : ''}
                                >
                                  {ENUM_LABEL[k]} {Math.round(v * 100)}
                                </span>
                              );
                            })}
                          </div>
                          <div className="hint">
                            Verlust Station {Math.round(p.chick.stationLoss * 100)} % · vor{' '}
                            {Math.max(0, Math.round((serverNow - p.chick.at) / 1000))} s
                          </div>
                          {p.stations.length > 0 && (
                            <div className="hint">
                              Stationen:{' '}
                              {p.stations
                                .map((s) => `R${s.round + 1} −${Math.round(s.loss * 100)}%`)
                                .join(' · ')}
                            </div>
                          )}
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Messwerte kommen nur, solange diese Seite offen ist (etwa zweimal pro Sekunde je Handy).
        </p>
      </section>

      {d.result && secrets && (
        <section className="card">
          <h2>Ergebnis</h2>
          <p>
            Gewinner: <strong>{d.result.winner}</strong> · beschuldigt: {nameOf(d.result.accusedId)}{' '}
            · {d.result.cuckooCaught ? 'Kuckuck enttarnt' : 'Kuckuck unentdeckt'}
          </p>
        </section>
      )}

      <section className="card">
        <h2>Ereignisse</h2>
        <ol className="event-log">
          {[...d.log].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <time>{new Date(e.at).toLocaleTimeString('de-DE')}</time>{' '}
              <span className={`ev ev-${e.type}`}>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/** Balken mit Markierung (Schwelle) und optionalem Band (z. B. sanftes Wiegen). */
function Meter({
  value,
  min,
  max,
  mark,
  band,
  label,
}: {
  value: number;
  min: number;
  max: number;
  mark?: number;
  band?: [number, number];
  label: string;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="admin-meter" title={label}>
      {band && (
        <div
          className="band"
          style={{ left: pct(band[0]), width: `calc(${pct(band[1])} - ${pct(band[0])})` }}
        />
      )}
      <div className="fill" style={{ width: pct(value) }} />
      {mark !== undefined && <div className="mark" style={{ left: pct(mark) }} />}
      <span>{label}</span>
    </div>
  );
}

/** In der Lobby: Preset (mit Version) oder Standardwerte auf den Raum anwenden. */
function RoomConfigCard({ code }: { code: string }) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [choice, setChoice] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => void adminApi<PresetSummary[]>('/api/admin/presets').then(setPresets), []);

  const apply = async () => {
    try {
      await adminApi(`/api/admin/rooms/${code}/config`, {
        method: 'POST',
        body: choice ? { kind: 'preset', presetId: choice } : { kind: 'default' },
      });
      setMsg('Angewendet.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <section className="card admin-inline">
      <h2>Konfiguration für diesen Raum</h2>
      <select value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">Standardwerte</option>
        {presets.map((p) => (
          <option key={p.presetId} value={p.presetId}>
            {p.name} (v{p.version})
          </option>
        ))}
      </select>
      <button className="primary" onClick={() => void apply()}>
        Anwenden
      </button>
      <button className="link" onClick={() => navigate(`/admin/presets?raum=${code}`)}>
        Werte einzeln bearbeiten …
      </button>
      {msg && <span className="hint">{msg}</span>}
    </section>
  );
}
