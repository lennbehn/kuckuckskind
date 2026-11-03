import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { GameClient } from './net/GameClient.ts';
import { GameClientContext } from './net/hooks.ts';
import { browserTokenStorage } from './net/session.ts';
import { DeviceSensors } from './sensors/DeviceSensors.ts';
import { SensorsContext } from './sensors/hooks.ts';
import './styles.css';
import { unlockSound } from './art/sound.ts';

const root = createRoot(document.getElementById('root')!);

if (window.location.pathname.startsWith('/admin')) {
  // Admin-Bereich: eigenes Bundle (Cognito), keine Spielverbindung.
  const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));
  root.render(
    <StrictMode>
      <Suspense fallback={<p style={{ padding: 16 }}>Lade Admin …</p>}>
        <AdminApp />
      </Suspense>
    </StrictMode>,
  );
} else {
  startGame();
}

function startGame() {
  /** WebSocket-Adresse: gleiche Herkunft wie die Seite (CloudFront bzw. Vite-Proxy). */
  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;

  const client = new GameClient({
    url: wsUrl,
    storage: browserTokenStorage(),
    device: navigator.userAgent.slice(0, 200),
  });
  client.start();
  const sensors = new DeviceSensors();

  // Handys schlafen ein oder frieren Tabs ein: beim Zurückkommen sofort neu verbinden und Uhr abgleichen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      client.reconnectNow();
      void sensors.reacquireWakeLock();
    }
  });
  window.addEventListener('online', () => client.reconnectNow());
  // iOS spielt Töne erst nach einer Berührung.
  window.addEventListener('pointerdown', unlockSound, { capture: true });

  root.render(
    <StrictMode>
      <GameClientContext.Provider value={client}>
        <SensorsContext.Provider value={sensors}>
          <App />
        </SensorsContext.Provider>
      </GameClientContext.Provider>
    </StrictMode>,
  );
}
