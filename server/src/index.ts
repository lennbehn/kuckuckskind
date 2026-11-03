import { readEnv } from './env.ts';
import { createLogger } from './log.ts';
import { createApp } from './app.ts';

const env = readEnv();
const log = createLogger(env.LOG_LEVEL, { stage: env.STAGE });
const app = createApp({ env, log });

app.http.listen(env.PORT, () => log.info('server gestartet', { port: env.PORT }));

const shutdown = (signal: string) => {
  log.info('server fährt herunter', { signal });
  app.close().then(
    () => process.exit(0),
    (err) => {
      log.error('fehler beim herunterfahren', { err: String(err) });
      process.exit(1);
    },
  );
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
