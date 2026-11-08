# ADR-0001: Echtzeit-Server auf ECS Fargate hinter ALB (statt API Gateway WebSocket + Lambda)

- Status: angenommen
- Datum: 2026-11-03

## Kontext

Eine Partie Kuckuckskind ist ein Zustandsautomat mit hartem Takt:

- „Weiter!“ muss auf 3–8 Handys gleichzeitig ausgelöst werden (Ziel: < 100 ms Abweichung).
- Jedes Handy meldet etwa alle 500 ms das Befinden „seines“ Kükens und Sensor-Ereignisse.
- Module wie Fuchs und Umarmung brauchen serverseitige Gleichzeitigkeits-Prüfungen
  über mehrere Geräte im selben Zeitfenster (z. B. 2/3 der Handys laut innerhalb von 800 ms).
- Der Server ist die einzige Instanz, die Rollen, Spick-Aufzeichnungen und Stimmen kennt.

Zur Wahl standen:

1. **API Gateway WebSocket + Lambda** (+ DynamoDB als Zustand)
2. **Node.js-Prozess mit WebSocket auf ECS Fargate hinter einem ALB**, Raum-Zustand im Speicher,
   Snapshots in DynamoDB

## Entscheidung

Option 2: ein Node.js-Server (TypeScript, `ws`) auf Fargate, erreichbar über
CloudFront → ALB → Fargate. Ein Raum ist ein Zustandsautomat im Speicher des Tasks.
Der Zustand wird bei Phasenwechseln und regelmäßig als Snapshot in DynamoDB geschrieben.

## Begründung

| Kriterium                                      | API GW + Lambda                                                                          | Fargate + ALB                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Server-Takt (Timer, „Weiter!“ planen)          | kein Prozess, der läuft; Timer bräuchten Step Functions/EventBridge (Granularität ≥ 1 s) | `setTimeout` im Raum-Automaten                                    |
| Zustand                                        | jede Nachricht: DynamoDB lesen/schreiben, Wettläufe bei gleichzeitigen Meldungen         | im Speicher, ein Thread je Raum, keine Wettläufe                  |
| Gleichzeitigkeit über Geräte (Fuchs, Umarmung) | Abgleich über DynamoDB, langsam und fehleranfällig                                       | direkter Vergleich im Speicher                                    |
| Latenz                                         | Kaltstarts, DynamoDB-Zugriff je Nachricht                                                | konstant niedrig                                                  |
| Kosten bei wenigen Testabenden                 | sehr niedrig                                                                             | ca. 10–15 €/Monat (kleiner Task + ALB)                            |
| Lokale Entwicklung / Tests                     | Emulation nötig                                                                          | `pnpm dev`, gleicher Code                                         |
| Skalierung                                     | automatisch                                                                              | ein Task genügt für viele Räume; mehr Tasks brauchen Raum-Routing |

Die Kosten sind für die Testphase vertretbar; Einfachheit, Takt und Testbarkeit wiegen schwerer.

## Folgen

- **Genau ein Task** (`desiredCount: 1`). Mehrere Tasks bräuchten Routing Raum → Task
  (z. B. Raumcode enthält Task-Kennung, oder ein Router-Dienst). Erst nötig bei deutlich
  mehr als ein paar hundert gleichzeitigen Räumen.
- **Deploys trennen Verbindungen.** Clients verbinden sich automatisch neu, der Server
  stellt Räume aus dem Snapshot wieder her (M2). Deploys nicht während eines Testabends.
- **Ein Ursprung für alles:** CloudFront liefert Frontend (S3) und leitet `/ws`, `/api/*`,
  `/healthz` an den ALB. Dadurch gibt es HTTPS/WSS auch ohne eigene Domain, und der ALB
  braucht kein Zertifikat. Der ALB nimmt nur Anfragen mit einem geheimen Header
  (aus Secrets Manager) an, den CloudFront mitsendet.
- ALB-Idle-Timeout 3600 s; Server und Client senden Pings alle 25 s.
- Kein NAT-Gateway: Tasks laufen in öffentlichen Subnetzen mit öffentlicher IP, eingehend
  aber nur vom ALB erreichbar.
