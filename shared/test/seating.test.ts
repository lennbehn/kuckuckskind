import { describe, expect, it } from 'vitest';
import {
  holderOf,
  holderSeat,
  leftNeighbor,
  ownerSeatHeldBy,
  phoneHeldBy,
  resolveConfig,
  totalRounds,
} from '../src/index.ts';

const seating = ['anna', 'ben', 'cem', 'dora'];

describe('Sitzordnung', () => {
  it('in Runde 0 hat jeder sein eigenes Handy', () => {
    for (const p of seating) expect(holderOf(p, 0, seating)).toBe(p);
  });

  it('Handys gehen jede Runde einen Platz nach links (im Uhrzeigersinn)', () => {
    expect(holderOf('anna', 1, seating)).toBe('ben');
    expect(holderOf('anna', 2, seating)).toBe('cem');
    expect(holderOf('dora', 1, seating)).toBe('anna');
    expect(leftNeighbor('dora', seating)).toBe('anna');
  });

  it('jedes Handy kommt bei jedem genau einmal vorbei', () => {
    for (const owner of seating) {
      const holders = seating.map((_, r) => holderOf(owner, r, seating));
      expect(new Set(holders).size).toBe(seating.length);
    }
  });

  it('in jeder Runde hält jeder genau ein Handy', () => {
    for (let r = 0; r < seating.length; r++) {
      const phones = seating.map((h) => phoneHeldBy(h, r, seating));
      expect([...phones].sort()).toEqual([...seating].sort());
    }
  });

  it('holderOf und phoneHeldBy sind Umkehrungen', () => {
    for (let r = 0; r < 10; r++) {
      for (let s = 0; s < 5; s++) expect(ownerSeatHeldBy(holderSeat(s, r, 5), r, 5)).toBe(s);
      for (const owner of seating)
        expect(phoneHeldBy(holderOf(owner, r, seating), r, seating)).toBe(owner);
    }
  });

  it('wirft bei unbekannten Spielern und kaputter Sitzordnung', () => {
    expect(() => holderOf('xaver', 0, seating)).toThrow();
    expect(() => holderOf('anna', 0, [])).toThrow();
    expect(() => holderOf('anna', 0, ['anna', 'anna'])).toThrow();
  });

  it('Rundenzahl: Standard = Spielerzahl, sonst aus der Konfiguration', () => {
    expect(totalRounds(resolveConfig(), 5)).toBe(5);
    expect(totalRounds(resolveConfig({ room: { rounds: 2 } }), 5)).toBe(2);
  });
});
