import {
  PROTOCOL_VERSION,
  clockSample,
  estimateClockOffset,
  parseServerMessage,
  type ClientMessage,
  type ClockSample,
  type ServerMessage,
} from '@kuckuckskind/shared';

/** WebSocket-Adresse: gleiche Herkunft wie die Seite (CloudFront bzw. Vite-Proxy). */
export function wsUrl(loc: Location = window.location): string {
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}/ws`;
}

export interface ConnectionStatus {
  state: 'connecting' | 'open' | 'closed';
  clock: ClockSample | null;
  error: string | null;
}

/**
 * Minimaler Verbindungs-Check für M1: Handshake + Uhrabgleich.
 * In M2 wird daraus der Client mit Wiederverbinden und regelmäßigem Abgleich.
 */
export function checkConnection(onStatus: (s: ConnectionStatus) => void, samples = 5): () => void {
  const status: ConnectionStatus = { state: 'connecting', clock: null, error: null };
  const measured: ClockSample[] = [];
  const ws = new WebSocket(wsUrl());
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const update = (patch: Partial<ConnectionStatus>) => onStatus(Object.assign(status, patch));

  ws.onopen = () => {
    update({ state: 'open' });
    send({ type: 'hello', protocol: PROTOCOL_VERSION, device: navigator.userAgent.slice(0, 200) });
  };
  ws.onmessage = (ev) => {
    const parsed = parseServerMessage(String(ev.data));
    if (!parsed.ok) return update({ error: parsed.error });
    const msg: ServerMessage = parsed.message;
    if (msg.type === 'welcome' || msg.type === 'time.pong') {
      if (msg.type === 'time.pong') {
        measured.push(
          clockSample(msg.clientSentAt, msg.serverReceivedAt, msg.serverSentAt, Date.now()),
        );
        update({ clock: estimateClockOffset(measured) });
      }
      if (measured.length < samples) send({ type: 'time.ping', clientSentAt: Date.now() });
    } else if (msg.type === 'error') {
      update({ error: msg.message });
    }
  };
  ws.onerror = () => update({ error: 'Verbindung fehlgeschlagen' });
  ws.onclose = () => update({ state: 'closed' });
  return () => ws.close();
}
