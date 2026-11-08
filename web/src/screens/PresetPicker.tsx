import { useEffect, useState } from 'react';
import type { PresetSummary, RoomView } from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';

/** Host wählt in der Lobby ein Preset aus dem Admin-Bereich (neueste Version). */
export function PresetPicker({ room }: { room: RoomView }) {
  const client = useGameClient();
  const [presets, setPresets] = useState<PresetSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/presets')
      .then((r) => (r.ok ? (r.json() as Promise<PresetSummary[]>) : []))
      .then((list) => alive && setPresets(list))
      .catch(() => alive && setPresets([]));
    return () => {
      alive = false;
    };
  }, []);

  const current = room.preset;
  // Admin hat eigene Werte gesetzt (kein gespeichertes Preset): nur anzeigen.
  const custom = current && current.presetId === null;
  if (!presets?.length && !current) return null;

  return (
    <label className="field">
      <span>Spielwerte</span>
      <select
        value={custom ? '__custom' : (current?.presetId ?? '')}
        onChange={(e) => client.selectPreset(e.target.value || null)}
      >
        <option value="">Standard</option>
        {custom && <option value="__custom">{current.name}</option>}
        {presets?.map((p) => (
          <option key={p.presetId} value={p.presetId}>
            {p.name} (v{p.version})
          </option>
        ))}
      </select>
      {current?.presetId && presets?.find((p) => p.presetId === current.presetId)?.description && (
        <span className="hint">
          {presets.find((p) => p.presetId === current.presetId)?.description}
        </span>
      )}
    </label>
  );
}
