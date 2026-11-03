import { createContext, useContext, useSyncExternalStore } from 'react';
import type { BotManager } from './BotManager.ts';

export const BotContext = createContext<BotManager | null>(null);

/** Bot-Modus aktiv? Liefert den Manager (und rendert bei Bot-Änderungen neu). */
export function useBots(): BotManager | null {
  const bots = useContext(BotContext);
  useSyncExternalStore(bots?.subscribe ?? noopSubscribe, bots?.getVersion ?? zero);
  return bots;
}

const noopSubscribe = () => () => {};
const zero = () => 0;

/** Zahl der Bots aus `?bots=N` (1–7), sonst 0. */
export function botCountFromUrl(search = window.location.search): number {
  const n = Number(new URLSearchParams(search).get('bots'));
  return Number.isInteger(n) && n > 0 ? Math.min(7, n) : 0;
}
