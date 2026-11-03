import { useEffect, useState } from 'react';
import { checkConnection, type ConnectionStatus } from './connection.ts';

/** Platzhalter-Startseite für M1: zeigt, ob Server und Uhrabgleich funktionieren. */
export function App() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => checkConnection((s) => setStatus({ ...s })), []);

  return (
    <main className="paper">
      <h1>Kuckuckskind</h1>
      <p className="lead">Bald schlüpft hier ein Küken.</p>
      <section className="card" aria-live="polite">
        <h2>Technik-Check</h2>
        <p>
          Server:{' '}
          <strong>
            {status?.state === 'open'
              ? 'verbunden'
              : status?.state === 'closed'
                ? 'getrennt'
                : 'verbinde …'}
          </strong>
        </p>
        {status?.clock && (
          <p>
            Uhr-Versatz: {Math.round(status.clock.offset)} ms · Laufzeit:{' '}
            {Math.round(status.clock.rtt)} ms
          </p>
        )}
        {status?.error && <p className="error">{status.error}</p>}
      </section>
    </main>
  );
}
