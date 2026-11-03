import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DeviceSensors, SensorsState } from './DeviceSensors.ts';

export const SensorsContext = createContext<DeviceSensors | null>(null);

export function useSensors(): DeviceSensors {
  const s = useContext(SensorsContext);
  if (!s) throw new Error('SensorsContext fehlt');
  return s;
}

export function useSensorsState(): SensorsState {
  const s = useSensors();
  return useSyncExternalStore(s.subscribe, s.getState);
}
