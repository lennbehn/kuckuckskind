import type { ConnectionStatus } from '../net/GameClient.ts';
import { useGameClient } from '../net/hooks.ts';

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const client = useGameClient();
  if (status === 'open') return null;
  return (
    <div className={`banner banner-${status}`} role="status">
      {status === 'connecting' && 'Verbinde …'}
      {status === 'offline' && 'Verbindung weg – verbinde neu …'}
      {status === 'replaced' && (
        <>
          Das Spiel ist auf einem anderen Tab geöffnet.{' '}
          <button className="link" onClick={() => client.reconnectNow()}>
            Hier weiterspielen
          </button>
        </>
      )}
      {status === 'outdated' && (
        <>
          Es gibt eine neue Version.{' '}
          <button className="link" onClick={() => window.location.reload()}>
            Neu laden
          </button>
        </>
      )}
    </div>
  );
}
