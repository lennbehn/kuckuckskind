# Ausbrüten & Technik-Check (M3)

Jeder führt jede aktive Pflegeart einmal am eigenen Ei aus. Jede gelungene Pflege = ein Riss.
Dabei werden die Sensoren des Geräts freigegeben und kalibriert. Erst wenn alle fertig sind,
schlüpfen alle Küken zum selben Server-Zeitpunkt; danach kurz die geheime Rolle.

## Ablauf auf dem Handy

1. **Ei antippen.** Aus diesem Antippen heraus: Bewegungs-Freigabe (iOS), Audio starten,
   Mikrofon anfragen, Bildschirm wach halten (Wake Lock). Checkliste: „Nicht stören“,
   Tipp „Zum Home-Bildschirm“ (iOS, Vollbild), Hinweis falls kein Wake Lock.
2. **Pusten:** `sensors.blow.calibrationMs` still sein → Ruhepegel (Median). Dann Pegel
   ≥ Ruhepegel + `thresholdOverNoiseDb` für `minDurationMs`. Ruhepegel und Spitze werden gespeichert.
3. **Wiegen:** Die ersten `hatching.rockCalibrationMs` Bewegung bestimmen die Empfindlichkeit
   (Median der Bewegung → Mitte des sanften Bands, begrenzt auf `rockScaleMin…Max`). Danach
   `hatching.rockGentleMs` im sanften Band. „Zu wild“ wird angezeigt.
4. **Zudecken:** ≥ `sensors.cover.minTouchPoints` Finger (Standard 3) oder Kontakt-Radius ≥ `minContactRadiusPx`
   für `hatching.coverHoldMs`. Klappt es nicht, reichen nach `fallbackAfterSeconds`
   `coverFallbackTouchPoints` Finger (Wert wird fürs Gerät gemerkt).
5. **Ersatz:** Fehlt ein Sensor oder ist er nicht erlaubt, steht der Grund am Ei und es gibt
   sofort eine Halte-Taste. Sonst erscheint sie nach `fallbackAfterSeconds`.
6. **Warten:** Liste, wer noch fehlt. Der Host kann „alle jetzt schlüpfen lassen“.

Die Kalibrierwerte liegen im `localStorage` des Geräts und gehen als `device.calibration`
an den Server (für das Live-Debug im Admin-Bereich, M6).

## Geheimhaltung

- Rollen werden erst beim Schlüpfen auf dem Server verteilt.
- Jeder Client bekommt nur seine eigene Rolle und nur bis `hatch.revealEndsAt`; danach sendet der
  Server den Raum ohne Rolle neu. Ein später weitergereichtes Handy kennt die Rolle nicht mehr.
- Beide Rollen-Karten sehen gleich aus (keine Farbe, die man von der Seite erkennt).

## Nur auf echten Geräten testbar

| Was                   | Worauf achten                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| iOS-Freigabe Bewegung | Dialog erscheint nach dem Antippen; nach „Nicht erlauben“ erst nach Neuladen wieder fragbar                         |
| Mikrofon-Pegel        | Ruhepegel in lauter Umgebung; ob Pusten ohne Mund direkt am Mikrofon reicht                                         |
| Wiegen                | Empfindlichkeit verschiedener Geräte (Werte im Admin vergleichen)                                                   |
| Zudecken              | Wie viele Finger iPhone/Android gleichzeitig melden; manche Geräte verwerfen Handflächen-Kontakt („palm rejection“) |
| Wake Lock             | iOS ab 16.4; in der PWA vom Home-Bildschirm                                                                         |
| Vibration             | nur Android                                                                                                         |

Im Browser-Test (Playwright) werden Mikrofon und Bewegung simuliert; der Test prüft Kalibrierung,
Schwellen, Ersatz-Bedienung, gleichzeitiges Schlüpfen und die Geheimhaltung der Rollen.
