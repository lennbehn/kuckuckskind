import { describe, expect, it } from 'vitest';
import { botCountFromUrl } from '../src/bots/context.ts';

describe('Bot-Modus', () => {
  it('liest die Zahl der Bots aus ?bots=N (1–7)', () => {
    expect(botCountFromUrl('')).toBe(0);
    expect(botCountFromUrl('?bots=4')).toBe(4);
    expect(botCountFromUrl('?bots=20')).toBe(7);
    expect(botCountFromUrl('?bots=0')).toBe(0);
    expect(botCountFromUrl('?bots=abc')).toBe(0);
    expect(botCountFromUrl('?profil=2&bots=2')).toBe(2);
  });
});
