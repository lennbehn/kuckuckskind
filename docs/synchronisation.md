# Raum & Synchronisation (M2)

## Wer hat welches Handy?

Jedes Handy gehört seinem Spieler (dort lebt sein Küken). Wer es gerade in der Hand hält,
folgt **nur** aus Sitzordnung und Runde (`shared/src/game/seating.ts`):

- Sitzordnung im Uhrzeigersinn; der nächste im Uhrzeigersinn sitzt **links**.
- In Runde `r` liegt das Handy von Platz `i` bei Platz `(i + r) mod n`. Runde 0 = eigenes Handy.
- Kein Spieler bestätigt etwas – das wäre fälschbar.

## Gemeinsamer Takt

Der Server schickt keinen „Jetzt weiter!“-Befehl, sondern einmalig einen **Takt**
(`timeline`: Startzeit `t0`, Stations- und Weitergabedauer, Rundenzahl). Jedes Gerät rechnet mit
`positionAt(timeline, serverNow)` selbst aus, wo die Partie steht
(`shared/src/game/timeline.ts`). Dadurch erscheint „Weiter!“ überall gleichzeitig, auch wenn
gerade eine Nachricht unterwegs hängt.

- Start, Fortsetzen und Überspringen liegen immer `timing.nextLeadMs` (1,5 s) in der Zukunft, damit
  alle Geräte die Änderung rechtzeitig kennen.
- Pause friert den Takt beim Server-Zeitpunkt der Pause ein.
- Der Server stellt einen Timer auf die nächste Grenze und wechselt nach der letzten Station in die Heimkehr.

## Uhrabgleich

NTP-artig (`shared/src/protocol/clock.ts`): Der Client schickt `time.ping` in Serien
(`timing.clockSyncSamples`, alle `timing.clockSyncIntervalMs`), der Server antwortet mit
Empfangs- und Sendezeit. Aus den letzten 20 Messungen zählt die schnellere Hälfte, davon der Median.
Beim Zurückkommen aus dem Hintergrund gleicht der Client sofort neu ab.

## Sitzungen & Wiederverbinden

- Beim ersten `hello` vergibt der Server ein zufälliges Sitzungs-Token. Der Client speichert es
  (sessionStorage + localStorage) und schickt es bei jedem Neuverbinden mit.
- Der Server speichert nur den SHA-256-Hash des Tokens.
- Verbindet sich dieselbe Sitzung ein zweites Mal (zweiter Tab), wird die alte Verbindung mit
  Code 4001 geschlossen; dort erscheint „Hier weiterspielen“.
- Lobby: Wer länger als `timing.reconnectGraceSeconds` weg ist, verliert seinen Platz.
  Während der Partie bleibt jeder am Tisch (die Sitzordnung darf sich nicht ändern).
- Zum Testen mit mehreren Tabs: `?profil=2` gibt einem Tab eine eigene Identität.

## Neustart & Deploy

Räume werden bei jeder Änderung (gebündelt nach 500 ms) als Snapshot gespeichert –
lokal im Speicher, in AWS in DynamoDB (`ROOMS_TABLE`, TTL 6 h). Beim Start lädt der Server alle
Snapshots; die Clients verbinden sich automatisch neu und landen wieder im Raum. Da der Takt aus
absoluten Zeiten besteht, läuft eine Partie nach dem Neustart an der richtigen Stelle weiter.
Räume ohne Verbindung werden nach 30 Minuten gelöscht.
