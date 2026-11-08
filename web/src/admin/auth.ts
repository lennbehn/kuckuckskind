/**
 * Admin-Anmeldung im Browser.
 * - In AWS liefert /runtime-config.json (vom CDK-Stack) die Cognito-IDs → Anmeldung mit
 *   E-Mail + Passwort (SRP), inkl. „neues Passwort“ beim ersten Login und TOTP, falls aktiviert.
 * - Lokal (ohne runtime-config.json): Passwort aus ADMIN_DEV_PASSWORD (Standard „kuckuck“).
 * Das ID-Token liegt nur in sessionStorage (Tab schließen = abgemeldet).
 */
import { z } from 'zod';

const RuntimeConfigSchema = z.object({
  stage: z.string(),
  cognito: z.object({ region: z.string(), userPoolId: z.string(), clientId: z.string() }),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

const TOKEN_KEY = 'kuckuck.admin.token';

export async function loadRuntimeConfig(): Promise<RuntimeConfig | null> {
  try {
    const res = await fetch('/runtime-config.json', { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    const parsed = RuntimeConfigSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const getToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // egal
  }
};

export type LoginStep =
  | { kind: 'done'; token: string }
  | { kind: 'newPassword'; submit: (password: string) => Promise<LoginStep> }
  | { kind: 'totp'; submit: (code: string) => Promise<LoginStep> };

/** Cognito-Anmeldung (Bibliothek wird erst hier geladen – nicht im Spiel-Bundle). */
export async function cognitoLogin(
  cfg: RuntimeConfig,
  email: string,
  password: string,
): Promise<LoginStep> {
  // amazon-cognito-identity-js erwartet ein Node-artiges `global`.
  (globalThis as { global?: unknown }).global ??= globalThis;
  const { AuthenticationDetails, CognitoUser, CognitoUserPool } =
    await import('amazon-cognito-identity-js');
  const pool = new CognitoUserPool({
    UserPoolId: cfg.cognito.userPoolId,
    ClientId: cfg.cognito.clientId,
  });
  const user = new CognitoUser({ Username: email, Pool: pool });

  return new Promise<LoginStep>((resolve, reject) => {
    const callbacks = {
      onSuccess: (session: { getIdToken(): { getJwtToken(): string } }) =>
        resolve({ kind: 'done', token: session.getIdToken().getJwtToken() }),
      onFailure: (err: Error) => reject(new Error(translate(err))),
      newPasswordRequired: () =>
        resolve({
          kind: 'newPassword',
          submit: (pw) =>
            new Promise<LoginStep>((res2, rej2) =>
              user.completeNewPasswordChallenge(
                pw,
                {},
                {
                  ...callbacks,
                  onSuccess: (s) => res2({ kind: 'done', token: s.getIdToken().getJwtToken() }),
                  onFailure: (e) => rej2(new Error(translate(e))),
                },
              ),
            ),
        }),
      totpRequired: () =>
        resolve({
          kind: 'totp',
          submit: (code) =>
            new Promise<LoginStep>((res2, rej2) =>
              user.sendMFACode(
                code,
                {
                  onSuccess: (s) => res2({ kind: 'done', token: s.getIdToken().getJwtToken() }),
                  onFailure: (e) => rej2(new Error(translate(e))),
                },
                'SOFTWARE_TOKEN_MFA',
              ),
            ),
        }),
    };
    user.authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      callbacks,
    );
  });
}

function translate(err: Error): string {
  const name = (err as { code?: string }).code ?? err.name;
  if (name === 'NotAuthorizedException') return 'E-Mail oder Passwort falsch.';
  if (name === 'UserNotFoundException') return 'E-Mail oder Passwort falsch.';
  if (name === 'InvalidPasswordException')
    return 'Passwort erfüllt die Regeln nicht (mind. 12 Zeichen).';
  if (name === 'CodeMismatchException') return 'Code falsch.';
  return err.message || 'Anmeldung fehlgeschlagen.';
}
