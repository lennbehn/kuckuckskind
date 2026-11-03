import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { GameClient, GameState } from './GameClient.ts';

export const GameClientContext = createContext<GameClient | null>(null);

export function useGameClient(): GameClient {
  const client = useContext(GameClientContext);
  if (!client) throw new Error('GameClientContext fehlt');
  return client;
}

export function useGameState(): GameState {
  const client = useGameClient();
  return useSyncExternalStore(client.subscribe, client.getState);
}

/** Server-Zeit, die sich alle `intervalMs` aktualisiert (für Countdowns). */
export function useServerNow(intervalMs = 100): number {
  const client = useGameClient();
  const [now, setNow] = useState(() => client.serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(client.serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [client, intervalMs]);
  return now;
}
