# Admin-Bereich (M6)

Adresse: **`/admin`** (z. B. `https://<dev-domain>/admin`). Eigenes Bundle – Spieler laden es nie.

## Anmelden

- **In AWS:** E-Mail + Passwort eines Cognito-Kontos in der Gruppe `admin`
  (anlegen: siehe [aws-setup.md](aws-setup.md#6-admin-konto-anlegen)). Beim ersten Login
  wird ein neues Passwort verlangt (mind. 12 Zeichen); TOTP wird abgefragt, falls eingerichtet.
- **Lokal (`pnpm dev`):** nur Passwort, Standard `kuckuck` (Umgebungsvariable `ADMIN_DEV_PASSWORD`
  am Server). Funktioniert nur mit `STAGE=local`; in dev/prod ohne Cognito ist der Bereich gesperrt.

Die Anmeldung gilt, solange der Tab offen ist (Token in `sessionStorage`, Cognito-Token 8 h gültig).

## Presets & Werte

- **Alle Spielwerte** stehen im Formular – erzeugt direkt aus `shared/src/config/schema.ts`
  (Beschriftung, Einheit, Grenzen, Schrittweite). Neue Werte erscheinen automatisch.
- Suche oben („Fuchs“, „Tempo“, „Schwelle“); geänderte Werte sind fett, Gruppen mit Änderungen
  haben einen Punkt, ↺ setzt einen Wert auf den Standard zurück. Ungültige Werte (z. B. sanftes
  Wiegen bis < ab) werden rot markiert und lassen sich nicht speichern.
- Gespeichert werden nur **Abweichungen vom Standard**. Jede Speicherung ist eine **neue Version**
  (nichts wird überschrieben); ältere Versionen lassen sich über „Version“ laden.
- „JSON“ zeigt die Abweichungen zum Kopieren (z. B. für Notizen zum Testabend).

## Preset pro Raum

- **Host in der Lobby:** Auswahl „Spielwerte“ (neueste Version des Presets). Alle sehen, welches
  Preset gilt.
- **Admin:** Raum öffnen → „Konfiguration für diesen Raum“ (Preset oder Standard), oder
  „Werte einzeln bearbeiten …“ → im Editor „Auf Raum … anwenden“ (eigene Werte ohne Speichern).
- Nur in der Lobby änderbar – während einer Partie bleiben die Werte fest.

## Live-Debug

Raum in der Liste anklicken. Die Seite aktualisiert sich jede Sekunde:

- **Takt:** Phase, Runde, Station/Weitergabe, Restzeit, Pause.
- **Spieler & Geräte:** Verbindung, Risse beim Ausbrüten, wer gerade wessen Handy hält,
  Technik-Check (Plattform, PWA, Wake Lock, Mikrofon-Ruhepegel/Spitze, Bewegungs-Empfindlichkeit,
  Finger fürs Zudecken).
- **Sensorpegel live** (nur solange die Seite offen ist, die Handys senden dann ~2×/s):
  Mikrofon mit Puste-Schwelle, Bewegung mit sanftem Band und „zu wild“-Grenze, Finger,
  laufende Pflege, ob das Handy im Hintergrund ist.
- **Küken:** Befinden (Strich = „glücklich ab“), Bedürfnisse (rot = dringend), Verlust der
  laufenden Station, Verlust je abgeschlossener Station.
- **Geheimes zeigen:** Rollen, Spick-Wahl, Stimmen, Ergebnis – standardmäßig aus. Nicht offen
  am Tisch zeigen!
- **Ereignisse:** Beitritte, Verbindungsabbrüche, Phasen, Risse, Stationen, Host-Steuerung,
  Konfigurationswechsel. Das Log enthält bewusst keine Rollen, Spick-Ziele oder Stimmen.

## Schnittstelle

Siehe `shared/src/admin/api.ts`. Token im Header `x-admin-token` (nicht `Authorization`, weil
CloudFront diesen Header nur mit Cache-Policy weiterreicht).
