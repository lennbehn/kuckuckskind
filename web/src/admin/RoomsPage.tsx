import { useEffect, useState } from 'react';
import type { RoomSummary } from '@kuckuckskind/shared';
import { adminApi } from './api.ts';
import { navigate } from './nav.ts';
import { PHASE_LABEL } from './labels.ts';

export function RoomsPage() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      adminApi<RoomSummary[]>('/api/admin/rooms').then(
        (r) => alive && (setRooms(r), setError(null)),
        (e: Error) => alive && setError(e.message),
      );
    void load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="card">
      <h2>Laufende Räume</h2>
      {error && <p className="problem">{error}</p>}
      {rooms?.length === 0 && (
        <p className="hint">Gerade keine Räume. Auf einem Handy einen Raum erstellen.</p>
      )}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Raum</th>
            <th>Phase</th>
            <th>Spieler</th>
            <th>Konfiguration</th>
            <th>seit</th>
          </tr>
        </thead>
        <tbody>
          {rooms
            ?.sort((a, b) => b.createdAt - a.createdAt)
            .map((r) => (
              <tr
                key={r.code}
                className="clickable"
                onClick={() => navigate(`/admin/raum/${r.code}`)}
              >
                <td>
                  <strong>{r.code}</strong>
                </td>
                <td>{PHASE_LABEL[r.phase]}</td>
                <td>
                  {r.connected}/{r.players} verbunden
                </td>
                <td>
                  {r.preset
                    ? `${r.preset.name}${r.preset.version ? ` v${r.preset.version}` : ''}`
                    : 'Standard'}
                </td>
                <td>
                  {new Date(r.createdAt).toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
