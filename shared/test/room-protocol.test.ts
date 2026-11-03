import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  hostSettingsToOverride,
  parseClientMessage,
  resolveConfig,
  tryResolveConfig,
} from '../src/index.ts';

describe('Raum-Nachrichten', () => {
  it('normalisiert Raumcode und Namen', () => {
    const r = parseClientMessage({ type: 'room.join', roomCode: ' bcdf ', name: '  Anna   Lena ' });
    expect(r.ok && r.message).toMatchObject({ roomCode: 'BCDF', name: 'Anna Lena' });
  });

  it('lehnt ungültige Codes und Namen ab', () => {
    expect(parseClientMessage({ type: 'room.join', roomCode: 'AEIO', name: 'x' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'room.join', roomCode: 'BCD', name: 'x' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'room.create', name: '   ' }).ok).toBe(false);
    expect(parseClientMessage({ type: 'room.create', name: 'x'.repeat(21) }).ok).toBe(false);
  });

  it('Alphabet hat keine Vokale oder Ziffern', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[AEIOU0-9]/);
  });

  it('übersetzt Host-Einstellungen in einen Override', () => {
    const o = hostSettingsToOverride({
      stationSeconds: 45,
      rounds: null,
      activeKinds: ['blow', 'cover'],
      modules: { fox: true },
    });
    const c = resolveConfig(o);
    expect(c.timing.stationSeconds).toBe(45);
    expect(c.room.rounds).toBeNull();
    expect(c.care.activeKinds).toEqual(['blow', 'cover']);
    expect(c.modules.fox.enabled).toBe(true);
    expect(hostSettingsToOverride({})).toEqual({});
  });

  it('ungültige Host-Einstellungen fallen bei der Prüfung durch', () => {
    expect(tryResolveConfig(hostSettingsToOverride({ stationSeconds: 2 })).success).toBe(false);
  });
});
