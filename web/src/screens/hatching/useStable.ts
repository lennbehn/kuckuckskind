import { useEffect, useRef, useState } from 'react';

/**
 * Gleicher Inhalt → gleiche Referenz. Jede Raum-Aktualisierung liefert eine neue
 * `config`; ohne das würden Sensor-Schritte bei jeder Nachricht neu starten.
 */
export function useStable<T>(value: T): T {
  const [state, setState] = useState(() => ({ value, json: JSON.stringify(value) }));
  const json = JSON.stringify(value);
  if (json !== state.json) {
    setState({ value, json });
    return value;
  }
  return state.value;
}

/** Immer die neueste Funktion, ohne Effekte neu zu starten. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
