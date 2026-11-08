import { useEffect, useState } from 'react';

/** Sekunden seit Anzeige der Komponente (für „Ersatz anbieten nach …“). */
export function useElapsed(): number {
  const [start] = useState(() => performance.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(id);
  }, []);
  return (now - start) / 1000;
}
