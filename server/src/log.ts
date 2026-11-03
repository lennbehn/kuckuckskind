/** Schlanker JSON-Logger für CloudWatch (eine Zeile pro Eintrag). */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel = 'info', base: Record<string, unknown> = {}): Logger {
  const min = LEVELS[level];
  const write = (lvl: LogLevel) => (msg: string, data?: Record<string, unknown>) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...base, ...data });
    if (lvl === 'error' || lvl === 'warn') console.error(line);
    else console.log(line);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
