import { rmsDb } from '@kuckuckskind/shared';
import type { SensorStatus } from '@kuckuckskind/shared';

export type LevelListener = (t: number, db: number) => void;

/**
 * Mikrofon-Pegel in dBFS, etwa 20-mal pro Sekunde. Audio wird nur lokal gemessen,
 * nie aufgezeichnet oder gesendet.
 */
export class MicLevel {
  private readonly analyser: AnalyserNode;
  private readonly buffer: Float32Array<ArrayBuffer>;
  private readonly listeners = new Set<LevelListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  db = -100;

  constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
  ) {
    const source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.timer = setInterval(() => this.tick(), 50);
  }

  private tick() {
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    this.analyser.getFloatTimeDomainData(this.buffer);
    this.db = rmsDb(this.buffer);
    const t = performance.now();
    for (const fn of this.listeners) fn(t, this.db);
  }

  subscribe(fn: LevelListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const track of this.stream.getTracks()) track.stop();
  }
}

/**
 * Mikrofon öffnen. Rauschunterdrückung, Echo-Unterdrückung und automatische Verstärkung
 * sind aus – sie würden Pusten wegfiltern bzw. den Pegel verfälschen.
 */
export async function openMic(
  ctx: AudioContext,
): Promise<{ status: SensorStatus; mic?: MicLevel }> {
  if (!window.isSecureContext) return { status: 'insecure' };
  if (!navigator.mediaDevices?.getUserMedia) return { status: 'unavailable' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    await ctx.resume().catch(() => {});
    return { status: 'ok', mic: new MicLevel(ctx, stream) };
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { status: 'denied' };
    if (name === 'NotFoundError') return { status: 'unavailable' };
    return { status: 'error' };
  }
}
