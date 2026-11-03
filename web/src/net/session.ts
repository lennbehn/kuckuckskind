/**
 * Sitzungs-Token: in sessionStorage (pro Tab, überlebt Neuladen) und localStorage
 * (überlebt Schließen des Browsers – iOS wirft Tabs gern aus dem Speicher).
 * Mit `?profil=2` bekommt ein Tab eine eigene Identität (zum Testen mit mehreren Tabs).
 */
export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function browserTokenStorage(search = window.location.search): TokenStorage {
  const profile = new URLSearchParams(search).get('profil');
  const key = `kuckuck.session${profile ? `.${profile}` : ''}`;
  return {
    get: () =>
      safe(() => sessionStorage.getItem(key), null) ?? safe(() => localStorage.getItem(key), null),
    set: (token) => {
      safe(() => sessionStorage.setItem(key, token), undefined);
      safe(() => localStorage.setItem(key, token), undefined);
    },
    clear: () => {
      safe(() => sessionStorage.removeItem(key), undefined);
      safe(() => localStorage.removeItem(key), undefined);
    },
  };
}

export function memoryTokenStorage(initial: string | null = null): TokenStorage {
  let token = initial;
  return { get: () => token, set: (t) => (token = t), clear: () => (token = null) };
}

const NAME_KEY = 'kuckuck.name';
export const rememberedName = () => safe(() => localStorage.getItem(NAME_KEY), null) ?? '';
export const rememberName = (name: string) =>
  safe(() => localStorage.setItem(NAME_KEY, name), undefined);
