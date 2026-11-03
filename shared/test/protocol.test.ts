import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  clockSample,
  estimateClockOffset,
  parseClientMessage,
  parseServerMessage,
} from '../src/index.ts';

describe('Protokoll', () => {
  it('liest gültige Client-Nachrichten', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message.type).toBe('hello');
  });

  it('lehnt unbekannte Typen, kaputtes JSON und Übergröße ab', () => {
    expect(parseClientMessage('{"type":"nope"}').ok).toBe(false);
    expect(parseClientMessage('{kein json').ok).toBe(false);
    expect(parseClientMessage('x'.repeat(MAX_MESSAGE_BYTES + 1)).ok).toBe(false);
    expect(parseClientMessage({ type: 'time.ping', clientSentAt: -1 }).ok).toBe(false);
  });

  it('Client darf keine Server-Nachrichten schicken', () => {
    expect(
      parseClientMessage({
        type: 'welcome',
        protocol: 1,
        sessionToken: 'x',
        resumed: false,
        serverTime: 1,
      }).ok,
    ).toBe(false);
  });

  it('liest Server-Nachrichten', () => {
    const r = parseServerMessage({
      type: 'time.pong',
      clientSentAt: 1,
      serverReceivedAt: 2,
      serverSentAt: 3,
    });
    expect(r.ok).toBe(true);
  });
});

describe('Uhrabgleich', () => {
  it('berechnet RTT und Versatz', () => {
    // Server geht 1000 ms vor, 20 ms Hinweg, 30 ms Rückweg, 5 ms Verarbeitung.
    const s = clockSample(0, 1020, 1025, 55);
    expect(s.rtt).toBe(50);
    expect(s.offset).toBe(995);
  });

  it('bevorzugt Messungen mit kurzer Laufzeit', () => {
    const est = estimateClockOffset([
      { rtt: 20, offset: 1000 },
      { rtt: 22, offset: 1002 },
      { rtt: 400, offset: 1200 },
      { rtt: 500, offset: 800 },
    ]);
    expect(est?.rtt).toBe(20);
    expect(est?.offset).toBe(1001);
  });

  it('gibt null ohne Messungen', () => {
    expect(estimateClockOffset([])).toBeNull();
  });
});
