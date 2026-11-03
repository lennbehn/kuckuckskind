import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { GameClient } from './net/GameClient.ts';
import { GameClientContext } from './net/hooks.ts';
import { browserTokenStorage } from './net/session.ts';
import './styles.css';

/** WebSocket-Adresse: gleiche Herkunft wie die Seite (CloudFront bzw. Vite-Proxy). */
const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;

const client = new GameClient({
  url: wsUrl,
  storage: browserTokenStorage(),
  device: navigator.userAgent.slice(0, 200),
});
client.start();

// Handys schlafen ein oder frieren Tabs ein: beim Zurückkommen sofort neu verbinden und Uhr abgleichen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') client.reconnectNow();
});
window.addEventListener('online', () => client.reconnectNow());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameClientContext.Provider value={client}>
      <App />
    </GameClientContext.Provider>
  </StrictMode>,
);
