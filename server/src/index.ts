import { readEnv } from './env.ts';
import { createLogger } from './log.ts';
import { createApp } from './app.ts';
import { DynamoRoomStore, MemoryRoomStore } from './rooms/store.ts';
import { DynamoPresetStore, MemoryPresetStore } from './admin/presets.ts';

const env = readEnv();
const log = createLogger(env.LOG_LEVEL, { stage: env.STAGE });
const store = env.ROOMS_TABLE ? new DynamoRoomStore(env.ROOMS_TABLE, log) : new MemoryRoomStore();
const presets = env.PRESETS_TABLE
  ? new DynamoPresetStore(env.PRESETS_TABLE, log)
  : new MemoryPresetStore();
const app = createApp({ env, log, store, presets });

try {
  await app.rooms.restore();
} catch (err) {
  log.error('räume konnten nicht geladen werden', { err: String(err) });
}

app.http.listen(env.PORT, () =>
  log.info('server gestartet', { port: env.PORT, store: env.ROOMS_TABLE ? 'dynamodb' : 'memory' }),
);

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
