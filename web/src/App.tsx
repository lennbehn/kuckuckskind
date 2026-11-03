import { useEffect } from 'react';
import { useGameState } from './net/hooks.ts';
import { showPath } from './routing.ts';
import { ConnectionBanner } from './screens/ConnectionBanner.tsx';
import { ErrorToast } from './screens/ErrorToast.tsx';
import { Home } from './screens/Home.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Rounds } from './screens/Rounds.tsx';
import { Homecoming } from './screens/Homecoming.tsx';
import { Hatching } from './screens/Hatching.tsx';
import { PeekChoice } from './screens/PeekChoice.tsx';
import { Voting } from './screens/Voting.tsx';
import { Reveal } from './screens/Reveal.tsx';
import { ChickRunnerHost } from './game/runnerHost.tsx';

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
  else if (room.phase === 'hatching') screen = <Hatching room={room} />;
  else if (room.phase === 'peekChoice') screen = <PeekChoice room={room} />;
  else if (room.phase === 'rounds') screen = <Rounds room={room} />;
  else if (room.phase === 'homecoming') screen = <Homecoming room={room} />;
  else if (room.phase === 'voting') screen = <Voting room={room} />;
  else screen = <Reveal room={room} />;

  // Das eigene Küken lebt weiter, egal welcher Bildschirm gerade zu sehen ist.
  if (room && room.timeline) screen = <ChickRunnerHost room={room}>{screen}</ChickRunnerHost>;

  return (
    <>
      <ConnectionBanner status={status} />
      {screen}
      <ErrorToast />
    </>
  );
}
