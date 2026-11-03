import { RoomCodeSchema } from '@kuckuckskind/shared';

/** Raumcode aus der Adresse `/r/ABCD` (Ziel des QR-Codes). */
export function roomCodeFromPath(path = window.location.pathname): string | null {
  const m = /^\/r\/([^/]+)\/?$/.exec(path);
  if (!m) return null;
  const parsed = RoomCodeSchema.safeParse(decodeURIComponent(m[1] as string));
  return parsed.success ? parsed.data : null;
}

/** Adresse anpassen, ohne neu zu laden (Suchparameter wie ?profil bleiben). */
export function showPath(path: string) {
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path + window.location.search);
  }
}

export const joinUrl = (code: string) => `${window.location.origin}/r/${code}`;
