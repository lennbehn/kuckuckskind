# Kuckuckskind

Handy-Tischspiel für 3–8 Spieler am selben Tisch – jeder mit eigenem Smartphone, im Browser,
Beitritt per QR-Code. Spielidee, Regeln und Architektur: [CLAUDE.md](CLAUDE.md).

## Aufbau

| Ordner    | Inhalt                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| `shared/` | Protokoll (Zod), zentrale Spielkonfiguration, Modul-Schnittstelle, Spiellogik |
| `server/` | Echtzeit-Server (Node.js, WebSocket)                                          |
| `web/`    | Frontend (React + Vite, PWA)                                                  |
| `infra/`  | AWS CDK (CloudFront, S3, Fargate, ALB, DynamoDB, Cognito, GitHub-OIDC)        |
| `assets/` | SVGs aus Claude Design                                                        |
| `docs/`   | ADRs, Einrichtung, Anleitungen                                                |

## Entwickeln

```bash
corepack enable
pnpm install
pnpm dev          # Server auf :8080, Frontend auf :5173 (leitet /ws an den Server)
```

Mit dem Handy im selben WLAN: `http://<IP-des-Rechners>:5173`. Hinweis: Mikrofon und
Bewegungssensor verlangen HTTPS – auf echten Geräten deshalb über die dev-Umgebung testen.

- **Bot-Modus:** `http://localhost:5173/?bots=4` – eine ganze Partie mit einem Gerät.
- **Mehrere Spieler in einem Browser:** `?profil=2`, `?profil=3` … (eigene Identität je Tab).
- **Admin:** `http://localhost:5173/admin`, Passwort `kuckuck`.
- **Küken-Galerie:** `http://localhost:5173/galerie`.
- **Balancing:** `pnpm --filter @kuckuckskind/shared balance`.

```bash
pnpm test         # alle Tests (Vitest)
pnpm lint
pnpm typecheck
pnpm build
```

## Deploy

Merge auf `main` → automatisch nach dev. prod von Hand über GitHub Actions.
Einmalige Einrichtung: [docs/aws-setup.md](docs/aws-setup.md).
Architektur-Entscheidungen: [docs/adr](docs/adr).

## Dokumentation

| Datei                                                | Inhalt                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| [docs/testabend.md](docs/testabend.md)               | Anleitung für den Testabend (Geräte, Ablauf, Admin, Probleme) |
| [docs/admin.md](docs/admin.md)                       | Admin-Bereich: Presets, Werte, Live-Debug                     |
| [docs/spielrunde.md](docs/spielrunde.md)             | Simulation, Hinweise, Abstimmung, Wertung, Balancing          |
| [docs/technik-check.md](docs/technik-check.md)       | Ausbrüten, Sensoren, Kalibrierung                             |
| [docs/synchronisation.md](docs/synchronisation.md)   | Takt, Uhrabgleich, Wiederverbinden                            |
| [docs/kueken-bausteine.md](docs/kueken-bausteine.md) | Spezifikation der Küken-SVGs für Claude Design                |
| [docs/aws-setup.md](docs/aws-setup.md)               | AWS und GitHub einrichten                                     |
