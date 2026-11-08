import { ADMIN_TOKEN_HEADER } from '@kuckuckskind/shared';
import { getToken } from './auth.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Aufruf der Admin-Schnittstelle mit Token; wirft ApiError (401 = neu anmelden). */
export async function adminApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { [ADMIN_TOKEN_HEADER]: token } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Fehler ${res.status}`);
  return data as T;
}
