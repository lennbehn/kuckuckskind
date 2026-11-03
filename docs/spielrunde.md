# Spielrunde (M4)

## Ablauf

```
lobby → hatching → peekChoice → rounds → homecoming → voting → reveal
```

| Phase        | Was passiert                                                             | Wer steuert                                             |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `peekChoice` | gemeinsames Schlüpfen, geheime Rolle, dann geheime Spick-Wahl            | Frist `timing.peekChoiceSeconds`; Host: „Rest zufällig“ |
| `rounds`     | Stationen im gemeinsamen Takt; jedes Handy rechnet sein Küken            | Takt; Host: Pause/Überspringen                          |
| `homecoming` | vage Hinweise + Spick-Aufzeichnung auf dem eigenen Handy                 | Host: „Zur Abstimmung“                                  |
| `voting`     | vorläufig wählen/ändern, sichtbar nur Stimmenzahl                        | Host: „Auszählen“ (Stichwahl bei Gleichstand)           |
| `reveal`     | Küken des Beschuldigten dreht sich überall gleichzeitig um, dann Wertung | Host: „Neue Partie“                                     |

## Bedürfnis-Simulation (`shared/src/chick/simulation.ts`)

Läuft auf dem Handy des **Eigentümers** – egal, wer es hält. Pro 100 ms:

1. Aktive Bedürfnisse wachsen (`needs.<need>.growthPerSecond` × `needs.tempo`).
2. Pflege lindert das passende Bedürfnis (× Charakter: `likedReliefFactor` / `dislikedReliefFactor`).
   - Pegel ≤ `needs.satisfiedLevel` → **übertriebene Pflege** (`sabotage.overcareHarmPerSecond`).
   - Pegel < `needs.wrongCareMaxLevel`, während ein anderes Bedürfnis dringend ist → **falsche Pflege**
     (`sabotage.wrongCareHarmPerSecond`).
   - Zu wildes Wiegen → `sabotage.roughRockHarmPerSecond`.
3. Ist ein Bedürfnis länger als `needs.neglectThresholdSeconds` dringend (≥ `urgentLevel`) →
   **Vernachlässigung** (`needs.neglectDamagePerSecond`). Das deckt „nichts tun“ und „spät reagieren“ ab.
4. Verlust je Station höchstens `sabotage.maxHarmPerStation` (**Sabotage-Limit**).
5. Ohne Verlust und mit allen Bedürfnissen unter `needs.contentLevel` erholt sich das Küken
   (`needs.recoveryPerSecond`).
6. Befinden ≤ `scoring.survivalMin` → Küken stirbt.

Der Kuckuck hat keine Sonderfähigkeit: Sabotage ist schlechte Pflege mit Absicht.

### Auf dem Handy (`web/src/game/ChickRunner.ts`)

- Simuliert wird die **gespielte Stationszeit** aus dem Takt, nicht die Uhrzeit:
  Pausen frieren ein, übersprungene Zeit wird nicht simuliert.
- War das Handy eingefroren (Bildschirm gesperrt), wird die echte vergangene Zeit **ohne Pflege**
  nachgeholt – es hat ja niemand gepflegt.
- Zustand liegt im `localStorage` (Neuladen setzt fort), Stand geht alle `timing.stateReportIntervalMs`
  als `chick.report` an den Server; jede Station am Ende als `chick.station` (mit Aufzeichnung,
  alle `peek.sampleIntervalMs`). Unbestätigte Stationen werden erneut gesendet.
- Pusten zählt erst nach `sensors.blow.minDurationMs` über der Schwelle – kurzes Lachen oder
  Sprechen am Tisch soll nicht als Pflege (oder übertriebene Pflege) gelten.

## Spick-Station

Jeder wählt geheim einen Mitspieler, der sein Küken in einer der Runden hält. Der Server behält nur
für diese eine Station die lückenlose Aufzeichnung. Bei der Heimkehr zeigt das eigene Handy einen
Verlauf (Befinden, Bedürfnisse, Pflege) und genaue Sätze („6 s zu wild geschüttelt“).

## Vage Hinweise (`shared/src/chick/hints.ts`)

Regelbasiert aus den Stationsstatistiken: Tod, Schütteln, Vernachlässigung je Bedürfnis,
übertriebene und falsche Pflege, Lieblings-/ungeliebte Pflege, Geborgenheit. Die stärksten
`hints.perChick` Sätze werden gewählt und **gemischt** – keine Namen, keine Reihenfolge.

## Abstimmung und Wertung

- Meiste Stimmen = beschuldigt. Gleichstand → Stichwahl unter den Gleichstehenden
  (`voting.maxRunoffs`), danach niemand. Keine Stimme für sich selbst.
- **Pflegeeltern** gewinnen, wenn alle Küken überleben und ein Kuckuck enttarnt ist.
- **Kuckuck** gewinnt, wenn er unentdeckt bleibt oder nur Kuckucks-Küken glücklich
  (≥ `scoring.happyMin`) sind. Erfüllen beide Seiten ihre Bedingung, gewinnt der Kuckuck.
- **Niemand** gewinnt, wenn der Kuckuck enttarnt ist, aber ein Küken gestorben ist.
- Ohne Kuckuck (z. B. `room.cuckooCount = 0`): keine Abstimmung; gemeinsam gewonnen, wenn alle überleben.

## Geheimhaltung

| Was                  | Wer sieht es      | Wann                     |
| -------------------- | ----------------- | ------------------------ |
| eigene Rolle         | nur man selbst    | bis `hatch.revealEndsAt` |
| Spick-Wahl           | nur man selbst    | ganze Partie             |
| eigene Stimme        | nur man selbst    | Abstimmung               |
| Stimmen je Kandidat  | alle (nur Anzahl) | Abstimmung               |
| Befinden aller Küken | alle              | ab Heimkehr              |
| alle Rollen          | alle              | Enthüllung               |

## Balancing

```bash
pnpm --filter @kuckuckskind/shared balance --games 300 --players 5
pnpm --filter @kuckuckskind/shared balance --json '{"needs":{"tempo":1.2}}'
```

Simuliert Partien mit Bots (gute Pflegeeltern, leiser Kuckuck mit zufälliger Strategie:
nichts tun, spät reagieren, falsche oder übertriebene Pflege). Abstimmung grob modelliert: Alle
Spick-Ergebnisse werden am Tisch geteilt, plus Rauschen.

Stand mit den Standardwerten (300 Partien, 5 Spieler): **Kuckuck gewinnt ≈ 53 %**, enttarnt ≈ 48 %,
kein Küken stirbt. Das Modell ist für die Pflegeeltern pessimistisch: In ≈ ⅓ der Partien
wählt niemand den Kuckuck als Spick-Station, und vage Hinweise sowie das Beobachten am Tisch
fließen nicht ein. Am Testabend realistisch eher 40–45 %. Stellschrauben im Admin-Bereich:
Bedürfnis-Tempo, Sabotage-Stärken, Sabotage-Limit, Vernachlässigungsschwelle.
