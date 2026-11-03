# Küken-Bausteine – Spezifikation für Claude Design

Vorlage: Design-Leinwand „Kuckuckskind – Küken-Stile“, **Variante B** (Bilderbuch-Aquarell).
Bis die finalen SVGs da sind, zeichnet `web/src/art/` einen Platzhalter nach dieser Spezifikation.
Die Galerie unter **`/galerie`** zeigt alle Stimmungen, das Ei, das Nest und die Symbole – als
Vergleich für die Entwürfe.

## Grundregeln

- **viewBox `0 0 200 200`** für das Küken (Ei: `0 0 200 230`). Ursprung oben links, y nach unten.
- Körpermitte bei **(100, 110)**, Körper-Radius ≈ 58. Nest-Oberkante bei y ≈ 152.
- Reines SVG: Pfade, Ellipsen, Kreise. Keine eingebetteten Bilder, keine Schriften, keine
  `<style>`-Blöcke, keine Masken mit Bildern. Farben als Hex.
- **Keine Transformationen** in den Bausteinen selbst – die App setzt Position und Drehung.
  Bausteine, die sich drehen (Flügel, Öhrchen), werden um ihren **Drehpunkt bei (0, 0)** gezeichnet.
- **Gleiche Punktzahl:** Formen, die sich mit der Stimmung ändern (Augen, Brauen, Schnabel, Mund,
  Schopf), werden für jede Stimmung mit **identischer Befehlsfolge** geliefert (gleiche Anzahl und Art
  von `M/C/Q/Z`). Nur Koordinaten ändern sich. So kann die App stufenlos zwischen ihnen überblenden.
- Aquarell-Look **nicht** einbacken: Die App legt ihre Filter darüber (`#kk-wc` für Flächen,
  `#kk-pencil` für Linien, siehe `web/src/art/ArtDefs.tsx`). Flächen also flach liefern, Linien
  als einfache Konturen. Wer Pigment-Texturen mitliefern will: als eigene Ebene `*-texture`.

## Ebenen (Reihenfolge von hinten nach vorn) und Namen

| Name (`id` in der Datei, `data-part` in der App) | Inhalt                                                | ändert sich mit                           |
| ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------- |
| `nest-back`                                      | hinterer Nestrand                                     | –                                         |
| `ck-ears`                                        | zwei Blattöhrchen (links/rechts), Drehpunkt am Ansatz | `earDroop` (Drehung)                      |
| `ck-body`                                        | Körperfläche, Bauchfleck, Rand-Pigment                | Kuckucks-Färbung, Bedürfnis-Farben        |
| `ck-outline`                                     | Bleistift-Kontur des Körpers                          | –                                         |
| `ck-wings`                                       | zwei Flügel, Drehpunkt an der Schulter                | `wingLift` (Drehung)                      |
| `ck-tuft`                                        | Schopf (3 Locken)                                     | `tuft`                                    |
| `ck-cheeks`                                      | Wangen                                                | `blush` (Deckkraft)                       |
| `ck-eyes`                                        | Augen + Glanzpunkte                                   | `eyeOpen`, `eyeSmile`, Lidschlag          |
| `ck-brows`                                       | Augenbrauen                                           | `browAngle`, `browRaise`                  |
| `ck-beak`                                        | Ober- und Unterschnabel                               | `mouthOpen`                               |
| `ck-mouth`                                       | Mundwinkel-Linie                                      | `mouth`                                   |
| `ck-tears`                                       | zwei Tränen                                           | `tears` (Deckkraft, tropft per Animation) |
| `nest-front`                                     | Moos und Zweige vorn                                  | –                                         |

Platzhalter-Positionen: Augen (82, 98) und (118, 98), Schnabel um (100, 112), Wangen (72, 114) und
(128, 114), Öhrchen-Ansatz (76, 66) und (124, 66), Schultern (50, 116) und (150, 116).

## Parameter

Alle Werte sind Zahlen; Stimmungen sind Wertesätze (`web/src/art/chickParams.ts`).

| Parameter   | Bereich | Bedeutung                                          |
| ----------- | ------- | -------------------------------------------------- |
| `mouth`     | −1 … 1  | Mundwinkel traurig … lächelnd                      |
| `mouthOpen` | 0 … 1   | Schnabel geschlossen … weit offen (Hitze: hecheln) |
| `eyeOpen`   | 0 … 1   | Augen zu … ganz offen                              |
| `eyeSmile`  | 0 … 1   | normale Augen … Lach-Augen „^ ^“                   |
| `browAngle` | −1 … 1  | besorgt (innen hoch) … grimmig (innen tief)        |
| `browRaise` | 0 … 1   | Brauen gesenkt … angehoben                         |
| `tuft`      | 0 … 1   | Schopf hängt … steht keck                          |
| `wingLift`  | −1 … 1  | Flügel hängen … gehoben                            |
| `tears`     | 0 … 1   | keine … volle Tränen                               |
| `blush`     | 0 … 1   | Wangenröte                                         |
| `earDroop`  | 0 … 1   | Öhrchen aufgestellt … hängen                       |
| `cuckoo`    | 0 … 1   | Kuckucks-Färbung (nur bei der Enthüllung)          |

Für Claude Design genügen die **Extremformen** je Parameter (z. B. Auge bei `eyeOpen` 0 und 1,
`eyeSmile` 0 und 1); Zwischenstufen rechnet die App.

## Stimmungen

`content` (zufrieden), `happy` (glücklich), `worried` (besorgt), `sad` (traurig), `crying` (weint),
`sleepy` (müde), `hot` (heiß), `jittery` (unruhig), `gone` (nicht mehr da), dazu Kuckucks-Variante
und Rückansicht (ohne Gesicht, für das Umdrehen bei der Enthüllung).

Zuordnung im Spiel: Befinden setzt die Grundstimmung (zufrieden → besorgt → traurig); spürbare
Bedürfnisse mischen Hitze → heiß, Müdigkeit → müde, Unruhe → unruhig dazu; Schaden → weint;
Lieblingspflege → glücklich mit Herzchen.

## Bedürfnisse als Farbe

Farbflecken im Körper (unter der Kontur, über der Körperfläche, auf den Körper beschnitten):

| Bedürfnis  | Farbe              | Ort           |
| ---------- | ------------------ | ------------- |
| Hitze      | `#e0563c` rot      | Gesicht/Mitte |
| Müdigkeit  | `#8e5cc4` lila     | Kopf oben     |
| Unruhe     | `#4f86d6` bläulich | unten/Seiten  |
| Hunger     | `#d39a35`          | Bauch         |
| Langeweile | `#7d9a7d`          | Seite         |

Dazu im Hinweisfeld je ein Symbol (`web/src/art/NeedIcon.tsx`): Flamme, Wirbel, Mond mit „z“,
Krümel, Note.

## Farben (Platzhalter)

Körper zartgelb `#fff7d6 → #f8df82 → #e9c55c`, Flügel `#efcd62`, Bleistift `#4b4033`,
Wangen `#f08a86`, Schnabel `#f09a4a`/`#d9743a`, Öhrchen `#9bbf6a`, Moos `#9fb36a → #5f7a3e`,
Zweige `#5a4630`, Papier `#f7f0de`, Kuckuck `#dfe3ea → #6f7a8f`.

## Ei und Nest

- Ei: Schale in `0 0 200 230`, Risse als 5 einzelne Pfade `egg-crack-1 … egg-crack-5` (in dieser
  Reihenfolge sichtbar), Sprenkel optional.
- Nest: `nest-back` und `nest-front` getrennt, damit das Küken dazwischen sitzt.

## Lieferung

Dateien nach `/assets/kueken/`: `kueken-<baustein>-<stimmung-oder-extrem>.svg`, z. B.
`kueken-eyes-open.svg`, `kueken-eyes-closed.svg`, `kueken-eyes-smile.svg`, `kueken-body.svg`,
`kueken-wing.svg`, `kueken-ear.svg`, `nest-front.svg`, `ei-schale.svg`. Die App übernimmt die Pfade
in `web/src/art/` (ein Pfad-Baustein je Datei, `id` wie oben).
