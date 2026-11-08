import { useEffect, useMemo, useState } from 'react';
import {
  defaultGameConfig,
  type GameConfig,
  type Preset,
  type PresetSummary,
} from '@kuckuckskind/shared';
import { adminApi } from './api.ts';
import { ConfigForm } from './ConfigForm.tsx';
import { configFrom, countLeaves, diffFromDefaults, validate } from './configForm.ts';
import { navigate } from './nav.ts';

/**
 * Alle Spielwerte bearbeiten und als versionierte Presets speichern. Mit `?raum=CODE`
 * lassen sich die Werte direkt auf einen Raum in der Lobby anwenden.
 */
export function PresetsPage() {
  const room = new URLSearchParams(window.location.search).get('raum');
  const [list, setList] = useState<PresetSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<Preset[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<GameConfig>(() => structuredClone(defaultGameConfig));
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showJson, setShowJson] = useState(false);
  /** Werte der geladenen Version – um „unverändert“ von „bearbeitet“ zu unterscheiden. */
  const [loadedJson, setLoadedJson] = useState<string | null>(null);

  const reload = () => adminApi<PresetSummary[]>('/api/admin/presets').then(setList);
  useEffect(() => void reload(), []);

  const load = async (presetId: string, v?: number) => {
    const all = await adminApi<Preset[]>(`/api/admin/presets/${presetId}`);
    const p = (v === undefined ? all[0] : all.find((x) => x.version === v)) ?? all[0];
    setSelected(presetId);
    setVersions(all);
    if (!p) return;
    setVersion(p.version);
    setName(p.name);
    setDescription(p.description);
    const loaded = configFrom(p.override);
    setConfig(loaded);
    setLoadedJson(JSON.stringify(diffFromDefaults(loaded) ?? {}));
    setMsg(null);
  };

  const startNew = () => {
    setSelected(null);
    setVersions([]);
    setVersion(null);
    setName('');
    setDescription('');
    setConfig(structuredClone(defaultGameConfig));
    setLoadedJson(null);
    setMsg(null);
  };

  const errors = useMemo(() => validate(config), [config]);
  const override = useMemo(() => diffFromDefaults(config) ?? {}, [config]);
  const changes = countLeaves(override);
  const valid = Object.keys(errors).length === 0;

  const save = async (asNew: boolean) => {
    try {
      const saved = await adminApi<Preset>('/api/admin/presets', {
        method: 'POST',
        body: {
          ...(asNew || !selected ? {} : { presetId: selected }),
          name,
          description,
          override,
        },
      });
      await reload();
      await load(saved.presetId, saved.version);
      setMsg({ text: `Gespeichert: ${saved.name} v${saved.version}`, ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
  };

  const applyToRoom = async () => {
    if (!room) return;
    try {
      await adminApi(`/api/admin/rooms/${room}/config`, {
        method: 'POST',
        // Unverändertes Preset → als Preset (mit Version); sonst als eigene Werte.
        body:
          selected && version !== null && JSON.stringify(override) === loadedJson
            ? { kind: 'preset', presetId: selected, version }
            : { kind: 'custom', override, label: name ? `${name} (bearbeitet)` : undefined },
      });
      setMsg({ text: `Auf Raum ${room} angewendet.`, ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
  };

  return (
    <div className="presets-layout">
      <aside className="card presets-list">
        <h2>Presets</h2>
        <button className="primary" onClick={startNew}>
          Neues Preset
        </button>
        <ul>
          {list.map((p) => (
            <li key={p.presetId}>
              <button
                className={p.presetId === selected ? 'active' : ''}
                onClick={() => void load(p.presetId)}
              >
                {p.name} <span className="hint">v{p.version}</span>
              </button>
            </li>
          ))}
        </ul>
        {list.length === 0 && <p className="hint">Noch keine Presets.</p>}
      </aside>

      <section className="card preset-editor">
        {room && (
          <p className="note">
            Bearbeiten für Raum <strong>{room}</strong>{' '}
            <button className="link" onClick={() => navigate(`/admin/raum/${room}`)}>
              zurück zum Raum
            </button>
          </p>
        )}
        <div className="preset-meta">
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Testabend kurz"
            />
          </label>
          {versions.length > 0 && (
            <label className="field">
              <span>Version</span>
              <select
                value={version ?? ''}
                onChange={(e) => void load(selected as string, Number(e.target.value))}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version} · {new Date(v.createdAt).toLocaleString('de-DE')}{' '}
                    {v.createdBy ? `· ${v.createdBy}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field wide">
            <span>Beschreibung</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Was ist anders, wofür gedacht?"
            />
          </label>
        </div>

        <div className="preset-actions">
          <span className="hint">
            {changes} {changes === 1 ? 'Wert weicht' : 'Werte weichen'} vom Standard ab
            {!valid && ' · Fehler im Formular'}
          </span>
          {selected && (
            <button
              className="primary"
              disabled={!valid || !name.trim()}
              onClick={() => void save(false)}
            >
              Als neue Version speichern
            </button>
          )}
          <button disabled={!valid || !name.trim()} onClick={() => void save(true)}>
            Als neues Preset speichern
          </button>
          {room && (
            <button disabled={!valid} onClick={() => void applyToRoom()}>
              Auf Raum {room} anwenden
            </button>
          )}
          <button className="link" onClick={() => setShowJson(!showJson)}>
            {showJson ? 'JSON ausblenden' : 'JSON'}
          </button>
        </div>
        {msg && <p className={msg.ok ? 'note' : 'problem'}>{msg.text}</p>}
        {showJson && <pre className="json">{JSON.stringify(override, null, 2)}</pre>}

        <ConfigForm value={config} onChange={setConfig} errors={errors} />
      </section>
    </div>
  );
}
