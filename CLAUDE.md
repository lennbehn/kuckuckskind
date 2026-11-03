# Kuckuckskind

Handy-Tischspiel für 3–8 Spieler am selben Tisch, jeder mit eigenem Smartphone.
Läuft im Browser (keine App, kein Konto), Beitritt per QR-Code.
Auf jedem Handy schlüpft ein Fantasieküken (halb Vogel, halb Mini-Monster).
Die Handys werden reihum nach links weitergegeben; jeder pflegt kurz das Küken
eines anderen. Einer ist heimlich der Kuckuck und sabotiert leise.
Am Ende kommen alle Küken heim, erzählen vage, wie es ihnen ging,
und die Runde stimmt ab, wer der Kuckuck war.

## Spielablauf (Basisversion)
1. Lobby: Host-Handy erstellt Raum, zeigt QR-Code. Spieler treten bei, geben
   Namen ein. Host legt Sitzordnung fest (Reihenfolge im Uhrzeigersinn),
   Stationszeit (Standard 60 s) und aktive Pflegearten/Module.
2. Ausbrüten = Tutorial + Technik-Check: Jeder führt jede aktive Pflegeart
   einmal am eigenen Ei aus (Pusten, Wiegen, Zudecken). Jede gelungene Pflege
   = ein Riss in der Schale. Dabei: Mikrofon-Ruhepegel und Puste-Pegel messen,
   Bewegungssensor-Freigabe (iOS: Antippen) und Empfindlichkeit kalibrieren,
   Zudecken prüfen, Wake-Lock aktivieren, Hinweis „Nicht stören einschalten“.
   Klappt etwas nicht: Hinweis am Ei + Ersatz (z. B. Taste statt Pusten).
   Sind gemeinsame Module aktiv (Fuchs, Umarmung), werden sie danach einmal
   gemeinsam geübt. Erst wenn alle fertig sind, schlüpfen alle Küken
   gleichzeitig.
3. Beim Schlüpfen: kurze geheime Rollen-Einblendung auf dem eigenen Handy
   (Pflegeeltern oder Kuckuck), danach verdeckt. Kuckucks-Küken sieht
   für andere genauso aus wie alle anderen.
4. Spick-Station: Jeder Eigentümer wählt geheim einen Mitspieler, bei dem
   sein Küken „genau hinschaut“. Diese eine Station wird lückenlos
   aufgezeichnet.
5. Runden: so viele wie Spieler. Je Station die eingestellte Zeit pflegen,
   dann „Weiter!“ auf allen Handys gleichzeitig, Handy nach links.
6. Heimkehr: Jedes Küken erzählt vage Eindrücke ohne Namen/Reihenfolge
   („Irgendwann wurde ich ganz doll geschüttelt“), dazu die Aufzeichnung
   der Spick-Station.
7. Abstimmung: Diskussion, jeder kann vorläufig auf dem Handy wählen und
   ändern; angezeigt wird nur die Anzahl der Stimmen. Mehrheit entscheidet,
   bei Gleichstand Stichwahl. Enthüllung: Auf allen Handys dreht sich
   gleichzeitig das Küken des Beschuldigten um.
8. Wertung: Pflegeeltern gewinnen, wenn alle Küken überleben und der Kuckuck
   enttarnt ist. Der Kuckuck gewinnt, wenn er unentdeckt bleibt oder sein
   Küken als einziges glücklich ist.

## Bedürfnisse und Sensoren
- Hitze → ins Mikrofon pusten (Pegel über Kalibrierschwelle)
- Unruhe → Handy sanft wiegen (Beschleunigung in sanftem Band; zu wild = schadet)
- Müdigkeit → Display mit der ganzen Hand zudecken (viele gleichzeitige
  Touchpunkte bzw. große Kontaktfläche)
- Später: Hunger (Krümel ins Maul wischen), Langeweile (leise vorsingen,
  Mikrofonpegel)
- Jedes Küken hat einen Charakter (mag/mag nicht bestimmte Pflege).
- Vernachlässigung schadet erst nach einer Schwelle (Standard 20 s).
- Sabotage-Arten: nichts tun, falsche Pflege, übertriebene Pflege,
  spätes Reagieren. Zielwert: Kuckuck gewinnt ca. 4 von 10 Partien.

## Module (einzeln aktivierbar, für Tests alle frei)
- Fuchs: taucht zufällig auf EINEM Display auf. Nur dieser Spieler sieht ihn
  und muss still sein und das Handy ruhig halten. Die anderen merken es am
  Verhalten und werden auf Blickkontakt gemeinsam laut: erstes Mal zuckt er,
  beim zweiten Mal flieht er. Erkennung: Server prüft, ob ein Anteil der
  Handys (Standard 2/3) im selben Zeitfenster deutlich über Ruhepegel liegt.
  Alternative für leise Umgebungen: gemeinsam auf den Tisch klopfen
  (Beschleunigung + Mikrofon). Danach erscheint er nach zufälliger Zeit
  bei einem anderen Spieler.
- Umarmung (Liebeskummer): zwei Handys aneinanderhalten; Server erkennt zwei
  zeitgleiche Stoß-Ereignisse. Der Gebetene darf ablehnen; wer hilft,
  unterbricht seine Pflege (Küken fällt dort zurück), bekommt aber
  „Geborgenheit“ (Bedürfnisse wachsen eine Weile langsamer).
- Gewitter: Blitz auf allen Handys, alle müssen sofort zudecken.
- Ansteckende Stimmung: weinendes Küken macht Nachbarn unruhig.
- Steigender Schwierigkeitsgrad (kooperativ).
- Zuflüstern (KI, später Bezahl-Erweiterung): Sprache → Text → Bewertung
  „liebevoll ↔ gemein“. Maßstab objektiv oder relativ zur Runde (einstellbar).
  Fließt in Befinden und vage Hinweise ein. Audio nie speichern.
  Nur nach Einwilligung eines Erwachsenen (auch für Kinder < 16);
  im Familienmodus standardmäßig aus.
- Familienmodus: ohne Kuckuck, rein kooperativ.

## Synchronisation
- Gemeinsame Uhr: Uhrabgleich mit dem Server beim Beitritt und regelmäßig;
  „Weiter!“ und Ereignisse mit Server-Zeitstempel, auf allen Geräten
  gleichzeitig ausgelöst.
- Wer welches Handy hat: nur aus Sitzordnung + Rundenzähler. KEINE
  Bestätigung durch Spieler (wäre fälschbar).
- Jedes Handy berechnet das Befinden „seines“ Kükens lokal (Simulation mit
  festen Parametern vom Server) und meldet laufend; bei Netzaussetzern
  läuft es weiter und gleicht danach ab.
- Rollen, Spick-Aufzeichnungen und Abstimmung liegen nur auf dem Server.
  Der Client bekommt nie Informationen, die er nicht sehen darf.

## Admin-Bereich (Testphase)
Geschützte Seite, auf der ALLE Spielwerte einstellbar und live sichtbar sind:
Stationszeit, Runden, Spielerzahl, Zahl der Kuckucke, aktive Pflegearten
und Module, Tempo der Bedürfnisse, Vernachlässigungsschwelle,
Sabotage-Stärken und -Limit, Sensor-Empfindlichkeiten, Fuchs (Häufigkeit,
Pause, Lautstärke-Schwelle, Anteil der Handys), Umarmung (Dauer, Bonus),
Zuflüstern (Maßstab, Gewichtung). Dazu Live-Debug: Werte jedes Kükens,
Sensorpegel je Gerät, Ereignislog. Parameter als versionierte Presets
speichern und pro Raum wählbar machen. Alle Werte zentral in einer
typisierten Konfiguration mit Standardwerten – nie hart im Code.

## Gestaltung: Bilderbuch-Aquarell
- Vorlage: Design-Leinwand „Kuckuckskind – Küken-Stile“, Variante B.
  Illustrationen kommen als SVG aus Claude Design.
- Zartgelbe Fantasieküken mit Blattöhrchen, Bleistiftlinien, Nest aus Moos
  und Zweigen, Papierstruktur. Aquarell-Look per SVG-Filter
  (feTurbulence + feDisplacementMap für Ränder, Pigment-Textur).
- Bedürfnisse als Farbverlauf im Küken (Hitze → rot, Müdigkeit → lila,
  Unruhe → bläulich, Tränen), dazu Symbol im Hinweisfeld.
- Schriften: Fraunces (kursiv, Titel), Nunito (Text).
- Küken ist parametrisch: Mundwinkel, Augenform, Augenbrauen, Schopf,
  Flügelhaltung, Tränen, Wangenröte als Zahlenwerte. Stimmungen sind
  Wertesätze; Übergänge stufenlos mit Feder-Animation. Atmen und Blinzeln
  laufen immer. Alle Formen haben in jeder Stimmung gleich viele Punkte.
- Kleine Effekte: fliegende Federn, Herzchen; Piepsen und Gurren.

## Stack
- Frontend: TypeScript, React + Vite, als PWA (zum Home-Bildschirm
  hinzufügbar → Vollbild auf dem iPhone). Animation: SVG + Feder-Animation
  (z. B. Framer Motion). Web Audio API für Pegel, DeviceMotion für
  Bewegung, Pointer/Touch Events, Screen Wake Lock API.
- Echtzeit-Server: Node.js (TypeScript) mit WebSocket, ein Raum = ein
  Zustandsautomat im Speicher; Snapshots in DynamoDB.
  Betrieb auf AWS ECS Fargate hinter ALB (WebSocket). Entscheidung
  gegenüber API Gateway WebSocket + Lambda als ADR dokumentieren.
- Hosting Frontend: S3 + CloudFront.
- Zuflüstern (Modul): Amazon Transcribe (Streaming, de-DE) + Claude über
  Amazon Bedrock, beides EU-Region; nur Ergebnis speichern, nie Audio.
- Admin-Login: Cognito (nur Admin-Konten); Spieler brauchen kein Konto.
- Infrastruktur als Code: AWS CDK (TypeScript). Region eu-central-1.
- CI/CD: GitHub Actions, AWS per OIDC, Umgebungen dev und prod.
- Monorepo (pnpm): /web, /server, /shared (Typen, Protokoll, Konfiguration,
  Zod-Schemas), /infra, /assets (SVGs aus Claude Design), /docs (ADRs).

## Bekannte Plattform-Grenzen (einplanen)
- iPhone-Browser: kein echtes Vollbild (→ PWA), keine Vibration
  (→ Ton/Licht als Ersatz), Benachrichtigungen nicht unterdrückbar
  (→ Hinweis „Nicht stören“), Bewegungssensor nur nach Antippen.
- Android: Chrome; Vibration verfügbar.

## Arbeitsweise
- Erst planen, dann bauen; kleine PRs auf Feature-Branches, nie direkt auf main.
- Spiellogik (Bedürfnisse, Sabotage, Wertung, Abstimmung) als reine,
  deterministisch testbare Funktionen in /shared mit Vitest-Tests.
- Ein „Bot-Modus“ für Entwicklung: simulierte Spieler im Browser, damit sich
  eine Partie auch mit einem Gerät durchspielen lässt.
- Sagen, was nur auf echten Geräten testbar ist (Sensoren, iOS-Freigaben).
