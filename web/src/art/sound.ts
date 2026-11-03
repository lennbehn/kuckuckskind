/**
 * Piepsen, Gurren und ein Gong für „Weiter!“ – synthetisch mit der Web Audio API,
 * keine Audiodateien. Auf iOS erst nach einer Berührung hörbar (unlockSound).
 */
let ctx: AudioContext | null = null;
const MUTE_KEY = 'kuckuck.mute';

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // egal
  }
}

/** Bei der ersten Berührung aufrufen. */
export function unlockSound() {
  if (ctx) return void ctx.resume().catch(() => {});
  const C =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (C) ctx = new C();
}

function tone(
  freqFrom: number,
  freqTo: number,
  start: number,
  dur: number,
  gain = 0.08,
  type: OscillatorType = 'sine',
  vibrato = 0,
) {
  if (!ctx || isMuted()) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 9;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Fröhliches oder klägliches Piepsen. */
export function peep(sad = false) {
  if (sad) {
    tone(2200, 1400, 0, 0.18);
    tone(2000, 1200, 0.22, 0.22);
  } else {
    tone(2200, 3000, 0, 0.08);
    tone(2400, 3200, 0.12, 0.08);
  }
}

/** Zufriedenes Gurren. */
export function coo() {
  tone(420, 360, 0, 0.35, 0.06, 'triangle', 18);
  tone(380, 330, 0.4, 0.4, 0.05, 'triangle', 18);
}

/** Gong für „Weiter!“. */
export function chime() {
  tone(880, 880, 0, 0.35, 0.07, 'triangle');
  tone(660, 660, 0.18, 0.5, 0.07, 'triangle');
}
