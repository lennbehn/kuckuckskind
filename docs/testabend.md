# Testabend – Anleitung

Für 3–8 Spieler am selben Tisch, jeder mit eigenem Handy. Dauer einer Partie mit 5 Spielern und
60 s Stationszeit: etwa 15 Minuten (Ausbrüten 2–3 min, 5 × 65 s Runden, Heimkehr und Abstimmung 5–10 min).

## Eine Woche vorher

- [ ] **dev-Umgebung läuft:** Spiel-Adresse aus dem letzten GitHub-Actions-Lauf (Deploy → Zusammenfassung)
      öffnen, `…/healthz` zeigt `"ok": true`.
- [ ] **Admin-Konto** angelegt (siehe [aws-setup.md](aws-setup.md#6-admin-konto-anlegen)), einmal unter
      `/admin` angemeldet (dabei neues Passwort gesetzt).
- [ ] **Presets** vorbereitet (siehe unten).
- [ ] Mit dem **Bot-Modus** eine Partie auf dem eigenen Handy durchgespielt (`…/?bots=4`).
- [ ] Kein Deploy mehr am Testabend selbst – ein Deploy trennt alle Verbindungen
      (Räume überleben, aber es ruckelt).

## Presets vorbereiten (Admin → Presets & Werte)

Vorschlag für den ersten Abend – jeweils als eigenes Preset speichern:

| Preset             | Änderung gegenüber Standard                        | Wofür                               |
| ------------------ | -------------------------------------------------- | ----------------------------------- |
| **Erste Partie**   | Stationszeit 45 s, Pflegearten nur Pusten + Wiegen | Einstieg, Regeln lernen             |
| **Standard**       | – (Standardwerte)                                  | Normale Partie                      |
| **Hektisch**       | Tempo der Bedürfnisse 1,4                          | Wenn es zu leicht ist               |
| **Gemütlich**      | Tempo 0,7, Vernachlässigungsschwelle 30 s          | Wenn es zu stressig ist             |
| **Leise Kuckucke** | Sabotage-Limit je Station 0,2                      | Wenn der Kuckuck zu leicht auffällt |

Nach jeder Partie können Werte geändert und als **neue Version** gespeichert werden; der Host wählt
das Preset in der Lobby unter „Spielwerte“ (es gilt immer die neueste Version).

## Geräte vorbereiten (jeder Spieler, 5 Minuten)

1. **QR-Code** in der Lobby scannen (oder Raumcode auf der Startseite eingeben).
2. **iPhone:** In Safari Teilen → „Zum Home-Bildschirm“, dann vom Home-Bildschirm starten (Vollbild,
   Bildschirm bleibt an). Android: Chrome reicht.
3. **„Nicht stören“** einschalten (iPhone: Kontrollzentrum → Fokus; Android: Schnelleinstellungen).
4. **Lautstärke** an, Stummschalter am iPhone aus (für Piepsen und „Weiter!“-Gong).
5. **Akku:** mindestens 50 %; Energiesparmodus aus (drosselt Sensoren und Bildschirm).
6. **Auto-Sperre** auf „Nie“ oder 5 min, falls „Bildschirm bleibt an“ im Technik-Check fehlt.

Beim **Ausbrüten** fragt das Handy nach Mikrofon und (iPhone) Bewegung – **erlauben**. Wer
versehentlich ablehnt: iPhone → Einstellungen → Safari → Mikrofon bzw. „Bewegung & Ausrichtung“
erlauben, Seite neu laden. Bis dahin gibt es Ersatz-Tasten.

## Ablauf am Tisch

1. **Host** erstellt den Raum, wählt das Preset, ordnet die **Sitzordnung im Uhrzeigersinn** (↑/↓) –
   wichtig, sonst stimmt „Gib mich nach links an …“ nicht.
2. **Ausbrüten:** Jeder pustet, wiegt und deckt sein Ei zu. Hängt ein Gerät: Host → „alle jetzt
   schlüpfen lassen“.
3. **Rolle** ansehen (ein paar Sekunden, danach verdeckt) – Handy nah bei sich halten.
4. **Spick-Wahl** geheim treffen.
5. **Runden:** Bei „Weiter!“ das Handy **nach links** geben. Host kann pausieren (Pause-Knopf auf
   seinem Handy – das wandert mit!).
6. **Heimkehr:** Jeder liest vor, was sein Küken erzählt, und was es bei der Spick-Station gesehen hat.
7. **Abstimmung:** diskutieren, wählen; Host zählt aus.

## Während der Partie: Admin auf dem Laptop

`/admin` → Raum anklicken → Live-Debug. Darauf achten:

- **Mikrofon:** liegt der Pegel beim Pusten deutlich über dem roten Strich? Beim Reden darunter?
  Wenn Reden schon reicht: Puste-Schwelle erhöhen (Sensoren → Pusten).
- **Bewegung:** landet sanftes Wiegen im grünen Band? Sonst Empfindlichkeit der Geräte vergleichen
  (Spalte „Bewegung“, Wert ×…).
- **Finger:** schafft jedes Gerät das Zudecken? „ab 2 Fingern“ heißt: Ersatz wurde gebraucht.
- **„im Hintergrund“ / „weg seit …“:** Handy gesperrt oder App gewechselt.
- **Küken:** Befinden und Verlust je Station – passt das Gefühl am Tisch zu den Zahlen?
- „Geheimes zeigen“ nur, wenn niemand auf den Laptop schaut.

## Nach jeder Partie notieren

- Wer war Kuckuck, wurde er erkannt, wer hat gewonnen? (Ergebnis steht im Admin.)
- War es zu leicht/zu schwer? Haben die vagen Hinweise geholfen? War die Spick-Station nützlich?
- Welche Pflege hat auf welchem Gerät nicht geklappt (Gerät + Browser)?
- Passende Preset-Änderung direkt als neue Version speichern.

Ziel für das Balancing: Der Kuckuck gewinnt etwa 4 von 10 Partien
(Simulation: [spielrunde.md](spielrunde.md#balancing)).

## Wenn etwas klemmt

| Problem                                      | Lösung                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| „Verbindung weg – verbinde neu …“            | wartet automatisch; WLAN prüfen. Der Takt läuft weiter.                             |
| Handy zeigt „auf einem anderen Tab geöffnet“ | „Hier weiterspielen“ antippen                                                       |
| Spieler hat Seite geschlossen                | Link/QR erneut öffnen – er landet wieder im Raum (gleiches Handy, gleicher Browser) |
| Pusten wird nicht erkannt                    | Ersatz-Taste erscheint nach 12 s; im Admin Pegel prüfen                             |
| Wiegen zu empfindlich/unempfindlich          | Sensoren → Wiegen (sanft ab/bis) anpassen                                           |
| Partie hängt                                 | Host: Pause → Überspringen; notfalls „Abbrechen“ (zurück in die Lobby)              |
| Server neu gestartet                         | Handys verbinden sich selbst neu; Räume werden wiederhergestellt                    |

## Bot-Modus (für Entwicklung und Vorbereitung)

`…/?bots=4` öffnen und einen Raum erstellen: vier Bots treten bei, brüten aus, wählen ihre
Spick-Station und stimmen ab. Dein Gerät spielt alle Stationen, die du am Tisch hättest – in jeder
Runde siehst du das Küken, das du gerade halten würdest; dein eigenes Küken pflegt derweil ein Bot
(ist er der Kuckuck, sabotiert er leise). Ohne Sensoren (Laptop) gibt es Ersatz-Tasten.
Nur zum Testen: Die Bots laufen in deinem Browser und kennen ihre Rollen.
