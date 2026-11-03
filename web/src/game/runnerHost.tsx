import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { RoomView } from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';
import { ChickRunner, type RunnerStorage, type RunnerView } from './ChickRunner.ts';

const storage: RunnerStorage = {
  load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  },
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Speicher voll/gesperrt: Simulation läuft trotzdem weiter.
    }
  },
};

const RunnerContext = createContext<ChickRunner | null>(null);

export function useChickRunner(): ChickRunner | null {
  return useContext(RunnerContext);
}

const EMPTY = () => () => {};
const NULL_VIEW = () => null;

export function useRunnerView(runner: ChickRunner | null): RunnerView | null {
  return useSyncExternalStore(runner?.subscribe ?? EMPTY, runner?.getView ?? NULL_VIEW);
}

/**
 * Hält das eigene Küken am Leben, solange die Partie läuft – unabhängig vom Bildschirm.
 * Der Runner lebt auf dem Handy des Eigentümers und rechnet alle 100 ms.
 */
export function ChickRunnerHost({ room, children }: { room: RoomView; children: React.ReactNode }) {
  const client = useGameClient();
  const chick = room.you.chick;
  const tl = room.timeline;
  const key =
    chick && tl && room.hatch
      ? `kuckuck.chick.${room.code}.${room.you.playerId}.${room.hatch.at}`
      : null;
  // Eine Runner-Instanz je Partie; beim Wechsel des Schlüssels neu anlegen (beim Rendern,
  // wie von React für abgeleiteten Zustand empfohlen).
  const [entry, setEntry] = useState<{ key: string | null; runner: ChickRunner | null }>({
    key: null,
    runner: null,
  });
  if (entry.key !== key) {
    const created =
      key && chick && tl
        ? new ChickRunner(
            key,
            room.config,
            chick.character,
            chick.seed,
            tl,
            storage,
            { report: (rep) => client.reportChick(rep), station: (s) => client.sendStation(s) },
            chick.last,
          )
        : null;
    setEntry({ key, runner: created });
  }
  const runner = entry.key === key ? entry.runner : null;

  // Alle 100 ms weiterrechnen.
  useEffect(() => {
    if (!runner) return;
    const id = setInterval(() => runner.advance(client.serverNow(), performance.now()), 100);
    return () => clearInterval(id);
  }, [runner, client]);

  useEffect(() => {
    if (runner && tl) runner.setTimeline(tl);
  }, [runner, tl]);

  // Was der Server noch nicht hat, erneut senden (z. B. nach Funkloch).
  const acked = chick?.reportedRounds.join(',');
  useEffect(() => {
    if (!runner || acked === undefined) return;
    const t = setTimeout(
      () => runner.resendMissing(acked ? acked.split(',').map(Number) : []),
      2000,
    );
    return () => clearTimeout(t);
  }, [runner, acked]);

  return <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
}
