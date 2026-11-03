import type { GameConfig } from '../config/schema.ts';

/**
 * Wer welches Handy hat – nur aus Sitzordnung und Rundenzähler, ohne Bestätigung durch Spieler.
 *
 * Die Sitzordnung ist im Uhrzeigersinn angegeben. Wer am Tisch sitzt und zur Mitte schaut,
 * hat den nächsten Platz im Uhrzeigersinn links von sich. Handys gehen jede Runde nach links,
 * also einen Platz weiter im Uhrzeigersinn: In Runde r liegt das Handy von Platz i bei
 * Platz (i + r) mod n. In Runde 0 hat jeder sein eigenes Handy.
 */

const mod = (a: number, n: number) => ((a % n) + n) % n;

function assertSeating(seating: readonly string[]) {
  if (seating.length === 0) throw new Error('Sitzordnung ist leer');
  if (new Set(seating).size !== seating.length) throw new Error('Sitzordnung hat doppelte Spieler');
}

function seatOf(playerId: string, seating: readonly string[]): number {
  const seat = seating.indexOf(playerId);
  if (seat < 0) throw new Error(`Spieler ${playerId} sitzt nicht am Tisch`);
  return seat;
}

/** Platz, an dem das Handy von Platz `ownerSeat` in Runde `round` liegt. */
export const holderSeat = (ownerSeat: number, round: number, n: number) =>
  mod(ownerSeat + round, n);

/** Platz, dessen Handy der Spieler auf `holderSeat` in Runde `round` hält. */
export const ownerSeatHeldBy = (holderSeat: number, round: number, n: number) =>
  mod(holderSeat - round, n);

/** Wer hält in Runde `round` das Handy (und damit das Küken) von `ownerId`? */
export function holderOf(ownerId: string, round: number, seating: readonly string[]): string {
  assertSeating(seating);
  return seating[holderSeat(seatOf(ownerId, seating), round, seating.length)] as string;
}

/** Wessen Handy (Küken) hält `holderId` in Runde `round`? */
export function phoneHeldBy(holderId: string, round: number, seating: readonly string[]): string {
  assertSeating(seating);
  return seating[ownerSeatHeldBy(seatOf(holderId, seating), round, seating.length)] as string;
}

/** Sitznachbar links (nächster im Uhrzeigersinn) – an ihn geht das Handy weiter. */
export function leftNeighbor(playerId: string, seating: readonly string[]): string {
  assertSeating(seating);
  return seating[mod(seatOf(playerId, seating) + 1, seating.length)] as string;
}

/** Zahl der Runden: aus der Konfiguration, sonst so viele wie Spieler. */
export function totalRounds(config: GameConfig, playerCount: number): number {
  return config.room.rounds ?? playerCount;
}
