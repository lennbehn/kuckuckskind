# Hinweis-Module: Falkenblick, Kuckucksfedern, Eule

Drei Module, die helfen, den Kuckuck zu finden (ähnlich der Seherin bei Werwolf).
Alle drei lassen sich in der Lobby unter „Module“ an- und abwählen; die genauen Werte
stehen im Admin-Bereich (`modules.falcon`, `modules.feathers`, `modules.owl`).
Die Logik liegt als reine Funktionen in `shared/src/modules/clues.ts`.

| Modul          | Standard | Kurz                                                                  |
| -------------- | -------- | --------------------------------------------------------------------- |
| Falkenblick    | an       | Wer gut pflegt, darf kurz sehen, was ein anderes Küken gerade braucht |
| Kuckucksfedern | aus      | Nach einer schlimmen Station liegt manchmal eine graue Feder im Nest  |
| Eule           | aus      | Ein Pflegeelternteil erfährt grob, wie viel eine Person geschadet hat |

## Falkenblick

- Verdient, wer an einer **fremden** Station gut pflegt: Verlust ≤ `maxLoss`,
  höchstens `maxMistakeSeconds` falsche/übertriebene Pflege, mindestens `minCareSeconds`
  gepflegt. Höchstens `maxTokens` Blicke je Person und Partie.
- Der Blick gehört der **Person**, nicht dem Handy: Er erscheint auf dem Handy, das sie
  gerade hält („🦅 Falkenblick einsetzen“). Sie wählt einen Mitspieler und sieht
  `durationSeconds` lang, welches Küken dieser hält und was es gerade braucht.
  So fällt auf, wenn jemand gerade das Falsche tut.
- Der Server errechnet die Bedürfnisse aus den laufenden Meldungen des Kükens
  (Schwelle `needThreshold`); die Antwort geht nur an das anfragende Handy.

## Kuckucksfedern

- Nach jeder fremden Station mit Verlust ≥ `minLoss` fällt mit Wahrscheinlichkeit
  `cuckooChance` (Halter ist Kuckuck) bzw. `fosterChance` (Pflegeeltern) eine graue Feder.
- Sie erscheint zu Beginn der **nächsten** Station `showSeconds` lang auf diesem Handy:
  „Eine graue Feder liegt im Nest … Wer hatte mich gerade?“ Wer das Küken vorher hatte,
  ergibt sich aus der Sitzordnung – die Runde muss es selbst herausfinden.
- Pflegeeltern können also auch Federn verursachen (Falschspur). An der eigenen Station
  (Runde 1) fällt nie eine Feder, darum frühestens ab Runde 3 sichtbar.
- Zufall reproduzierbar je Partie, Küken und Runde.

## Eule

- Ab `minPlayers` Spielern wird beim Schlüpfen ein **Pflegeelternteil** zufällig zur Eule
  (nie der Kuckuck). Sie sieht das bei der Rollen-Einblendung.
- Bei „Genau hinschauen“ wählt sie zusätzlich geheim eine Person zum Beobachten
  (ohne Wahl: zufällig).
- Bei der Heimkehr erfährt nur sie, ob diese Person den Küken **mehr / etwa so viel /
  weniger** geschadet hat als die anderen (Rang des Gesamtschadens unter allen Mitspielern).
  Sie erfährt **nicht** direkt, wer der Kuckuck ist; ein vorsichtiger Kuckuck kann im
  Mittelfeld landen, ein ungeschickter Pflegeelternteil oben.
- Ob sie es erzählt (und ob man ihr glaubt), entscheidet sie selbst.

## Geheimhaltung

| Was                    | Wer sieht es                |
| ---------------------- | --------------------------- |
| Eule (wer)             | nur die Eule                |
| Eulen-Wahl und -Urteil | nur die Eule                |
| Anzahl Falkenblicke    | nur die Person, die sie hat |
| Falkenblick-Ergebnis   | nur das anfragende Handy    |
| Feder                  | wer das Handy gerade hält   |

Im Admin-Live-Debug sind Eule, Eulen-Wahl, Blicke und Federn je Spieler sichtbar.

## Balancing (300 Partien, 5 Spieler, Modell)

| Aktive Hinweis-Module      | Kuckuck gewinnt |
| -------------------------- | --------------- |
| keine                      | ≈ 53 %          |
| nur Falkenblick (Standard) | ≈ 44 %          |
| nur Kuckucksfedern         | ≈ 42 %          |
| nur Eule                   | ≈ 40 %          |
| alle drei                  | ≈ 28 %          |

Einzeln liegt jedes Modul nahe am Ziel (≈ 40 %), zusammen wird es für den Kuckuck zu
schwer. Für Probespiele: eins oder zwei aktivieren, bei mehreren eventuell
`feathers.cuckooChance` senken oder `falcon.maxTokens` auf 1 lassen.

```bash
pnpm --filter @kuckuckskind/shared balance --json '{"modules":{"owl":{"enabled":true}}}'
```

## Nur auf echten Geräten prüfbar

- Ob man am Tisch unauffällig zum anderen Handy schauen kann, während der Falkenblick läuft.
- Ob die Feder-Einblendung nach dem Weitergeben rechtzeitig bemerkt wird.
