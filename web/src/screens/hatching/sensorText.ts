import type { SensorStatus } from '@kuckuckskind/shared';
import type { Platform } from '../../sensors/platform.ts';

/** Verständliche Erklärung, warum ein Sensor nicht geht – mit Hinweis zur Abhilfe. */
export function sensorProblem(
  sensor: 'mic' | 'motion',
  status: SensorStatus,
  platform: Platform,
): string | null {
  const what = sensor === 'mic' ? 'Mikrofon' : 'Bewegungssensor';
  switch (status) {
    case 'ok':
    case 'unused':
      return null;
    case 'denied':
      return platform === 'ios'
        ? `${what} nicht erlaubt. In Einstellungen → Safari → ${what === 'Mikrofon' ? 'Mikrofon' : 'Bewegung & Ausrichtung'} erlauben und die Seite neu laden.`
        : `${what} nicht erlaubt. Über das Schloss-Symbol in der Adressleiste erlauben und neu laden.`;
    case 'insecure':
      return `${what} braucht eine sichere Verbindung (https).`;
    case 'unavailable':
      return `Dieses Gerät hat keinen nutzbaren ${what}.`;
    case 'error':
      return `${what} konnte nicht gestartet werden.`;
  }
}
