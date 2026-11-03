import { timingSafeEqual } from 'node:crypto';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Env } from '../env.ts';
import type { Logger } from '../log.ts';

export interface AdminIdentity {
  /** E-Mail oder Benutzername. */
  name: string;
}

export interface AdminAuth {
  readonly mode: 'cognito' | 'dev' | 'off';
  verify(token: string | undefined): Promise<AdminIdentity | null>;
}

/**
 * Admin-Anmeldung:
 * - In AWS: Cognito-ID-Token, Benutzer muss in der Gruppe „admin“ sein.
 * - Lokal (STAGE=local ohne Cognito): Token „dev:<Passwort>“ mit ADMIN_DEV_PASSWORD.
 * - Sonst ist der Admin-Bereich gesperrt.
 */
export function createAdminAuth(env: Env, log: Logger): AdminAuth {
  if (env.COGNITO_USER_POOL_ID && env.COGNITO_CLIENT_ID) {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: env.COGNITO_USER_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
      tokenUse: 'id',
      groups: 'admin',
    });
    return {
      mode: 'cognito',
      async verify(token) {
        if (!token) return null;
        try {
          const payload = await verifier.verify(token);
          return { name: String(payload.email ?? payload['cognito:username'] ?? 'admin') };
        } catch (err) {
          log.warn('admin-token abgelehnt', { err: String(err).slice(0, 200) });
          return null;
        }
      },
    };
  }
  if (env.STAGE === 'local') {
    const expected = Buffer.from(`dev:${env.ADMIN_DEV_PASSWORD}`);
    return {
      mode: 'dev',
      async verify(token) {
        if (!token) return null;
        const given = Buffer.from(token);
        return given.length === expected.length && timingSafeEqual(given, expected)
          ? { name: 'dev' }
          : null;
      },
    };
  }
  log.warn('admin-bereich gesperrt: keine cognito-konfiguration');
  return { mode: 'off', verify: async () => null };
}
