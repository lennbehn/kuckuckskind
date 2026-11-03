import { useEffect } from 'react';
import { useGameState } from './net/hooks.ts';
import { showPath } from './routing.ts';
import { ConnectionBanner } from './screens/ConnectionBanner.tsx';
import { ErrorToast } from './screens/ErrorToast.tsx';
import { Home } from './screens/Home.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Rounds } from './screens/Rounds.tsx';
import { Homecoming } from './screens/Homecoming.tsx';

export function App() {
  const { room, status, closedReason } = useGameState();

  // Im Raum zeigt die Adresse den Raumcode – Neuladen und Teilen funktionieren so.
  useEffect(() => {
    if (room) showPath(`/r/${room.code}`);
    else if (closedReason) showPath('/');
  }, [room, closedReason]);

  let screen;
  if (!room) screen = <Home />;
  else if (room.phase === 'lobby') screen = <Lobby room={room} />;
  else if (room.phase === 'rounds') screen = <Rounds room={room} />;
  else screen = <Homecoming room={room} />;

  return (
    <>
      <ConnectionBanner status={status} />
      {screen}
      <ErrorToast />
    </>
  );
}
