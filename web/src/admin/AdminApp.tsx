import { useCallback, useEffect, useState } from 'react';
import { ApiError, adminApi } from './api.ts';
import {
  cognitoLogin,
  getToken,
  loadRuntimeConfig,
  setToken,
  type LoginStep,
  type RuntimeConfig,
} from './auth.ts';
import { RoomsPage } from './RoomsPage.tsx';
import { RoomPage } from './RoomPage.tsx';
import { PresetsPage } from './PresetsPage.tsx';
import { navigate } from './nav.ts';
import './admin.css';

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

/**
 * Admin-Bereich für die Testphase: alle Spielwerte, Presets, Live-Debug.
 * Geschützt per Cognito (lokal: Passwort).
 */
export default function AdminApp() {
  const path = usePath();
  // Ohne Token gleich zum Login; mit Token beim Server prüfen (abgelaufen → Login).
  const [version, setVersion] = useState(0);
  const [auth, setAuth] = useState<{ version: number; me: { name: string } | null } | null>(null);
  const check = useCallback(() => setVersion((v) => v + 1), []);
  const token = getToken();

  useEffect(() => {
    if (!token) return;
    let alive = true;
    adminApi<{ name: string }>('/api/admin/me').then(
      (me) => alive && setAuth({ version, me }),
      () => {
        setToken(null);
        if (alive) setAuth({ version, me: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [token, version]);

  const checking = !!token && auth?.version !== version;
  const me = token ? (auth?.me ?? null) : null;

  if (checking)
    return (
      <main className="admin">
        <p>Einen Moment …</p>
      </main>
    );
  if (!me) return <Login onDone={check} />;

  const roomMatch = /^\/admin\/raum\/([A-Z]{4})$/.exec(path);
  return (
    <main className="admin">
      <header className="admin-head">
        <strong>Kuckuckskind · Admin</strong>
        <nav>
          <a
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              navigate('/admin');
            }}
            aria-current={path === '/admin'}
          >
            Räume
          </a>
          <a
            href="/admin/presets"
            onClick={(e) => {
              e.preventDefault();
              navigate('/admin/presets');
            }}
            aria-current={path.startsWith('/admin/presets')}
          >
            Presets & Werte
          </a>
          <a href="/galerie">Galerie</a>
        </nav>
        <span className="hint">
          {me.name} ·{' '}
          <button
            className="link"
            onClick={() => {
              setToken(null);
              void check();
            }}
          >
            abmelden
          </button>
        </span>
      </header>
      <ErrorBoundaryReset onAuthError={check}>
        {roomMatch ? (
          <RoomPage code={roomMatch[1] as string} />
        ) : path.startsWith('/admin/presets') ? (
          <PresetsPage />
        ) : (
          <RoomsPage />
        )}
      </ErrorBoundaryReset>
    </main>
  );
}

/** Bei abgelaufener Anmeldung (401) zurück zum Login. */
function ErrorBoundaryReset({
  children,
  onAuthError,
}: {
  children: React.ReactNode;
  onAuthError: () => void;
}) {
  useEffect(() => {
    const on = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof ApiError && e.reason.status === 401) {
        setToken(null);
        onAuthError();
      }
    };
    window.addEventListener('unhandledrejection', on);
    return () => window.removeEventListener('unhandledrejection', on);
  }, [onAuthError]);
  return <>{children}</>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [cfg, setCfg] = useState<RuntimeConfig | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<LoginStep | null>(null);
  const [extra, setExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => void loadRuntimeConfig().then(setCfg), []);

  const finish = async (s: LoginStep) => {
    if (s.kind === 'done') {
      setToken(s.token);
      onDone();
    } else {
      setStep(s);
      setExtra('');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step && step.kind !== 'done') await finish(await step.submit(extra));
      else if (cfg) await finish(await cognitoLogin(cfg, email.trim(), password));
      else {
        setToken(`dev:${password}`);
        await adminApi('/api/admin/me').catch(() => {
          setToken(null);
          throw new Error('Passwort falsch.');
        });
        onDone();
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  if (cfg === undefined)
    return (
      <main className="admin">
        <p>Einen Moment …</p>
      </main>
    );
  return (
    <main className="admin admin-login">
      <form className="card stack" onSubmit={submit}>
        <h1 className="small">Admin</h1>
        {step?.kind === 'newPassword' ? (
          <label className="field">
            <span>Neues Passwort (mind. 12 Zeichen)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
        ) : step?.kind === 'totp' ? (
          <label className="field">
            <span>Code aus der Authenticator-App</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
        ) : (
          <>
            {cfg ? (
              <label className="field">
                <span>E-Mail</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ) : (
              <p className="hint">
                Lokale Entwicklung: Passwort aus ADMIN_DEV_PASSWORD (Standard „kuckuck“).
              </p>
            )}
            <label className="field">
              <span>Passwort</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        )}
        {error && <p className="problem">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </main>
  );
}
