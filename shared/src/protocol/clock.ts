/**
 * Uhrabgleich nach NTP-Art. Aus einem Ping/Pong ergibt sich:
 *   rtt    = (t3 - t0) - (t2 - t1)
 *   offset = ((t1 - t0) + (t2 - t3)) / 2       (Serverzeit ≈ lokale Zeit + offset)
 * mit t0 = Client sendet, t1 = Server empfängt, t2 = Server sendet, t3 = Client empfängt.
 */
export interface ClockSample {
  rtt: number;
  offset: number;
}

export function clockSample(
  clientSentAt: number,
  serverReceivedAt: number,
  serverSentAt: number,
  clientReceivedAt: number,
): ClockSample {
  return {
    rtt: clientReceivedAt - clientSentAt - (serverSentAt - serverReceivedAt),
    offset: (serverReceivedAt - clientSentAt + (serverSentAt - clientReceivedAt)) / 2,
  };
}

/**
 * Bester Versatz aus mehreren Messungen: Median der Messungen mit der kürzesten
 * Laufzeit (die Hälfte mit kleinster RTT), robust gegen WLAN-Ausreißer.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): ClockSample | null {
  if (samples.length === 0) return null;
  const byRtt = [...samples].sort((a, b) => a.rtt - b.rtt);
  const best = byRtt.slice(0, Math.max(1, Math.ceil(byRtt.length / 2)));
  const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  const offset =
    offsets.length % 2 === 1
      ? (offsets[mid] as number)
      : ((offsets[mid - 1] as number) + (offsets[mid] as number)) / 2;
  return { offset, rtt: (best[0] as ClockSample).rtt };
}
