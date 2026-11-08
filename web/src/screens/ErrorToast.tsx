import { useEffect } from 'react';
import { useGameClient, useGameState } from '../net/hooks.ts';

export function ErrorToast() {
  const client = useGameClient();
  const { lastError } = useGameState();

  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => client.dismissError(), 4000);
    return () => clearTimeout(t);
  }, [client, lastError]);

  if (!lastError) return null;
  return (
    <div className="toast" role="alert" onClick={() => client.dismissError()}>
      {lastError.message}
    </div>
  );
}
