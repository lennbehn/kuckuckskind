import { z } from 'zod';

// Fehlermeldungen auf Deutsch (Admin-Formular, Lobby-Einstellungen).
z.config(z.locales.de());

/**
 * Zentrale, typisierte Spielkonfiguration.
 *
 * Jeder Spielwert steht hier mit Standardwert, Grenzen und Beschriftung.
 * Der Admin-Bereich baut sein Formular aus diesem Schema (über die `meta`-Angaben),
 * Presets speichern nur Abweichungen davon. Spiellogik liest Werte ausschließlich
 * aus einer aufgelösten `GameConfig` – nie hart im Code.
 */

/** Wird erhöht, wenn sich die Form der Konfiguration inkompatibel ändert. */
export const CONFIG_SCHEMA_VERSION = 1;

export type FieldMeta = {
  /** Beschriftung im Admin-Formular. */
  label: string;
  /** Einheit, z. B. "s", "ms", "dB", "/s". */
  unit?: string;
  /** Kurze Erklärung für den Admin. */
  description?: string;
  /** Schrittweite für Schieberegler. */
  step?: number;
};

const num = (def: number, min: number, max: number, meta: FieldMeta) =>
  z.number().min(min).max(max).default(def).meta(meta);

const int = (def: number, min: number, max: number, meta: FieldMeta) =>
  z.number().int().min(min).max(max).default(def).meta(meta);

const bool = (def: boolean, meta: FieldMeta) => z.boolean().default(def).meta(meta);

/** Objekt-Gruppe, deren Felder alle Standardwerte haben – `{}` reicht als Eingabe. */
const group = <T extends z.core.$ZodLooseShape>(shape: T, meta: FieldMeta) =>
  // Leere Eingabe ist gültig, weil jedes Feld einen Standardwert hat.
  z
    .object(shape)
    .prefault({} as never)
    .meta(meta);

// ---------------------------------------------------------------------------
// Pflegearten und Bedürfnisse
// ---------------------------------------------------------------------------

/** Pflegearten. `feed` und `sing` kommen später (Hunger, Langeweile). */
export const CARE_KINDS = ['blow', 'rock', 'cover', 'feed', 'sing'] as const;
export const CareKindSchema = z.enum(CARE_KINDS);
export type CareKind = z.infer<typeof CareKindSchema>;

/** Bedürfnisse; jedes wird durch genau eine Pflegeart gestillt. */
export const NEEDS = ['heat', 'restless', 'tired', 'hunger', 'bored'] as const;
export const NeedSchema = z.enum(NEEDS);
export type Need = z.infer<typeof NeedSchema>;

export const CARE_FOR_NEED: Record<Need, CareKind> = {
  heat: 'blow',
  restless: 'rock',
  tired: 'cover',
  hunger: 'feed',
  bored: 'sing',
};

export const NEED_FOR_CARE: Record<CareKind, Need> = {
  blow: 'heat',
  rock: 'restless',
  cover: 'tired',
  feed: 'hunger',
  sing: 'bored',
};

const needSchema = (label: string, growth: number) =>
  group(
    {
      growthPerSecond: num(growth, 0, 0.5, {
        label: 'Wachstum',
        unit: '/s',
        step: 0.001,
        description: 'Wie schnell das Bedürfnis steigt (0 = gestillt, 1 = maximal).',
      }),
      reliefPerSecond: num(0.25, 0, 2, {
        label: 'Linderung',
        unit: '/s',
        step: 0.01,
        description: 'Wie schnell passende Pflege das Bedürfnis senkt.',
      }),
      urgentLevel: num(0.6, 0.1, 1, {
        label: 'Dringend ab',
        step: 0.05,
        description: 'Ab diesem Pegel zählt die Vernachlässigungs-Uhr.',
      }),
    },
    { label },
  );

// ---------------------------------------------------------------------------
// Module (Erweiterungen, einzeln schaltbar)
// ---------------------------------------------------------------------------

export const MODULE_IDS = [
  'fox',
  'hug',
  'storm',
  'contagion',
  'difficulty',
  'whisper',
  'family',
] as const;
export const ModuleIdSchema = z.enum(MODULE_IDS);
export type ModuleId = z.infer<typeof ModuleIdSchema>;

const modulesSchema = group(
  {
    fox: group(
      {
        enabled: bool(false, { label: 'Fuchs aktiv' }),
        meanIntervalSeconds: num(90, 10, 600, {
          label: 'Mittlere Zeit bis zum Auftauchen',
          unit: 's',
        }),
        cooldownSeconds: num(30, 0, 600, { label: 'Pause nach Flucht', unit: 's' }),
        loudnessOverNoiseDb: num(18, 3, 60, {
          label: 'Lautstärke-Schwelle über Ruhepegel',
          unit: 'dB',
        }),
        quorumShare: num(2 / 3, 0.1, 1, {
          label: 'Anteil der Handys',
          step: 0.05,
          description: 'So viele Handys müssen gleichzeitig laut sein.',
        }),
        windowMs: int(800, 100, 5000, { label: 'Zeitfenster', unit: 'ms' }),
        scaresToFlee: int(2, 1, 5, { label: 'Erschrecken bis zur Flucht' }),
        knockAlternative: bool(false, {
          label: 'Klopfen statt Rufen',
          description: 'Für leise Umgebungen: gemeinsam auf den Tisch klopfen.',
        }),
      },
      { label: 'Fuchs' },
    ),
    hug: group(
      {
        enabled: bool(false, { label: 'Umarmung aktiv' }),
        holdSeconds: num(3, 0.5, 20, { label: 'Dauer der Umarmung', unit: 's' }),
        bumpWindowMs: int(300, 50, 2000, { label: 'Zeitfenster Stoß', unit: 'ms' }),
        cozinessSeconds: num(30, 0, 300, { label: 'Dauer Geborgenheit', unit: 's' }),
        cozinessGrowthFactor: num(0.5, 0, 1, {
          label: 'Bedürfnis-Tempo bei Geborgenheit',
          step: 0.05,
        }),
      },
      { label: 'Umarmung' },
    ),
    storm: group(
      {
        enabled: bool(false, { label: 'Gewitter aktiv' }),
        meanIntervalSeconds: num(120, 10, 900, { label: 'Mittlerer Abstand', unit: 's' }),
        reactionSeconds: num(3, 0.5, 15, { label: 'Zeit zum Zudecken', unit: 's' }),
      },
      { label: 'Gewitter' },
    ),
    contagion: group(
      {
        enabled: bool(false, { label: 'Ansteckende Stimmung aktiv' }),
        strength: num(0.3, 0, 1, { label: 'Stärke', step: 0.05 }),
      },
      { label: 'Ansteckende Stimmung' },
    ),
    difficulty: group(
      {
        enabled: bool(false, { label: 'Steigender Schwierigkeitsgrad aktiv' }),
        growthPerRound: num(0.1, 0, 1, { label: 'Zuwachs pro Runde', step: 0.01 }),
      },
      { label: 'Schwierigkeitsgrad' },
    ),
    whisper: group(
      {
        enabled: bool(false, { label: 'Zuflüstern aktiv' }),
        scale: z
          .enum(['objective', 'relative'])
          .default('objective')
          .meta({ label: 'Maßstab', description: 'Objektiv oder relativ zur Runde.' }),
        weight: num(0.3, 0, 1, { label: 'Gewichtung', step: 0.05 }),
        requireAdultConsent: z.literal(true).default(true).meta({
          label: 'Einwilligung eines Erwachsenen nötig',
          description: 'Immer an – nicht abschaltbar.',
        }),
      },
      { label: 'Zuflüstern (KI)' },
    ),
    family: group(
      {
        enabled: bool(false, {
          label: 'Familienmodus',
          description: 'Ohne Kuckuck, rein kooperativ.',
        }),
      },
      { label: 'Familienmodus' },
    ),
  },
  { label: 'Module' },
);

// ---------------------------------------------------------------------------
// Gesamtkonfiguration
// ---------------------------------------------------------------------------

export const GameConfigSchema = z
  .object({
    room: group(
      {
        minPlayers: int(3, 2, 8, { label: 'Mindestens Spieler' }),
        maxPlayers: int(8, 3, 12, { label: 'Höchstens Spieler' }),
        cuckooCount: int(1, 0, 3, { label: 'Zahl der Kuckucke' }),
        rounds: z
          .number()
          .int()
          .min(1)
          .max(16)
          .nullable()
          .default(null)
          .meta({ label: 'Runden', description: 'Leer = so viele wie Spieler.' }),
      },
      { label: 'Raum' },
    ),

    timing: group(
      {
        stationSeconds: num(60, 10, 300, { label: 'Stationszeit', unit: 's' }),
        nextLeadMs: int(1500, 300, 5000, {
          label: 'Vorlauf „Weiter!“',
          unit: 'ms',
          description: 'So weit im Voraus kündigt der Server den Wechsel an.',
        }),
        handoverSeconds: num(5, 1, 30, { label: 'Zeit zum Weitergeben', unit: 's' }),
        roleRevealMs: int(4000, 1000, 15000, { label: 'Rollen-Einblendung', unit: 'ms' }),
        peekChoiceSeconds: num(30, 5, 120, { label: 'Zeit für Spick-Wahl', unit: 's' }),
        clockSyncIntervalMs: int(10000, 1000, 60000, { label: 'Uhrabgleich alle', unit: 'ms' }),
        clockSyncSamples: int(5, 1, 20, { label: 'Messungen je Uhrabgleich' }),
        stateReportIntervalMs: int(500, 100, 5000, {
          label: 'Befinden melden alle',
          unit: 'ms',
        }),
        reconnectGraceSeconds: num(120, 10, 900, {
          label: 'Wiederverbinden möglich für',
          unit: 's',
        }),
      },
      { label: 'Zeiten' },
    ),

    care: group(
      {
        activeKinds: z
          .array(CareKindSchema)
          .min(1)
          .default(['blow', 'rock', 'cover'])
          .meta({ label: 'Aktive Pflegearten' }),
      },
      { label: 'Pflege' },
    ),

    needs: group(
      {
        tempo: num(1, 0.1, 5, {
          label: 'Tempo der Bedürfnisse',
          step: 0.05,
          description: 'Multipliziert das Wachstum aller Bedürfnisse.',
        }),
        neglectThresholdSeconds: num(20, 0, 120, {
          label: 'Vernachlässigungsschwelle',
          unit: 's',
          description: 'So lange darf ein Bedürfnis dringend sein, bevor es schadet.',
        }),
        neglectDamagePerSecond: num(0.02, 0, 0.2, {
          label: 'Schaden durch Vernachlässigung',
          unit: '/s',
          step: 0.001,
        }),
        recoveryPerSecond: num(0.003, 0, 0.1, {
          label: 'Erholung',
          unit: '/s',
          step: 0.001,
          description: 'So schnell steigt das Befinden, wenn kein Bedürfnis drückt.',
        }),
        contentLevel: num(0.3, 0, 1, {
          label: 'Zufrieden unter',
          step: 0.05,
          description: 'Liegen alle Bedürfnisse darunter, erholt sich das Küken.',
        }),
        satisfiedLevel: num(0.05, 0, 0.5, {
          label: 'Gestillt unter',
          step: 0.01,
          description: 'Pflege darunter ist übertrieben und schadet.',
        }),
        wrongCareMaxLevel: num(0.3, 0, 1, {
          label: 'Falsche Pflege unter',
          step: 0.05,
          description:
            'Pflege für ein Bedürfnis unter diesem Pegel, während ein anderes dringend ist, gilt als falsch.',
        }),
        initialMax: num(0.3, 0, 1, {
          label: 'Startwert höchstens',
          step: 0.05,
          description: 'Bedürfnisse starten zufällig zwischen 0 und diesem Wert.',
        }),
        heat: needSchema('Hitze', 0.03),
        restless: needSchema('Unruhe', 0.025),
        tired: needSchema('Müdigkeit', 0.02),
        hunger: needSchema('Hunger', 0.01),
        bored: needSchema('Langeweile', 0.01),
      },
      { label: 'Bedürfnisse' },
    ),

    character: group(
      {
        likesPerChick: int(1, 0, 3, { label: 'Lieblingspflegen je Küken' }),
        dislikesPerChick: int(1, 0, 3, { label: 'Ungeliebte Pflegen je Küken' }),
        likedReliefFactor: num(1.5, 1, 5, { label: 'Wirkung Lieblingspflege', step: 0.1 }),
        dislikedReliefFactor: num(0.6, 0, 1, { label: 'Wirkung ungeliebte Pflege', step: 0.05 }),
      },
      { label: 'Charakter' },
    ),

    sabotage: group(
      {
        wrongCareHarmPerSecond: num(0.03, 0, 0.5, {
          label: 'Schaden falsche Pflege',
          unit: '/s',
          step: 0.005,
        }),
        overcareHarmPerSecond: num(0.04, 0, 0.5, {
          label: 'Schaden übertriebene Pflege',
          unit: '/s',
          step: 0.005,
        }),
        roughRockHarmPerSecond: num(0.05, 0, 0.5, {
          label: 'Schaden zu wildes Wiegen',
          unit: '/s',
          step: 0.005,
        }),
        maxHarmPerStation: num(0.35, 0, 1, {
          label: 'Sabotage-Limit je Station',
          step: 0.05,
          description: 'Höchster Befindens-Verlust durch eine einzelne Station.',
        }),
      },
      { label: 'Sabotage' },
    ),

    sensors: group(
      {
        blow: group(
          {
            calibrationMs: int(2000, 500, 10000, { label: 'Messdauer Ruhepegel', unit: 'ms' }),
            thresholdOverNoiseDb: num(15, 3, 60, {
              label: 'Puste-Schwelle über Ruhepegel',
              unit: 'dB',
            }),
            minDurationMs: int(300, 0, 3000, { label: 'Mindestdauer Pusten', unit: 'ms' }),
          },
          { label: 'Pusten (Mikrofon)' },
        ),
        rock: group(
          {
            gentleMin: num(0.8, 0, 20, { label: 'Sanft ab', unit: 'm/s²', step: 0.1 }),
            gentleMax: num(4, 0, 30, { label: 'Sanft bis', unit: 'm/s²', step: 0.1 }),
            harshAbove: num(8, 0, 50, { label: 'Zu wild ab', unit: 'm/s²', step: 0.1 }),
            smoothingMs: int(300, 0, 2000, { label: 'Glättung', unit: 'ms' }),
          },
          { label: 'Wiegen (Bewegung)' },
        ),
        cover: group(
          {
            minTouchPoints: int(3, 1, 10, { label: 'Mindestens Finger' }),
            minContactRadiusPx: num(25, 0, 200, { label: 'Kontaktfläche ab (Radius)', unit: 'px' }),
            holdMs: int(500, 0, 5000, { label: 'Halten', unit: 'ms' }),
          },
          { label: 'Zudecken (Touch)' },
        ),
      },
      { label: 'Sensoren' },
    ),

    hatching: group(
      {
        rockGentleMs: int(1500, 200, 10000, {
          label: 'Sanftes Wiegen nötig',
          unit: 'ms',
          description: 'So lange muss beim Ausbrüten sanft gewiegt werden.',
        }),
        coverHoldMs: int(1000, 100, 10000, { label: 'Zudecken halten', unit: 'ms' }),
        rockCalibrationMs: int(2500, 500, 10000, {
          label: 'Messdauer Wiegen',
          unit: 'ms',
          description: 'Bewegung, aus der die Empfindlichkeit des Geräts bestimmt wird.',
        }),
        rockScaleMin: num(0.4, 0.1, 1, { label: 'Empfindlichkeit mindestens', step: 0.05 }),
        rockScaleMax: num(2.5, 1, 5, { label: 'Empfindlichkeit höchstens', step: 0.05 }),
        fallbackAfterSeconds: num(12, 3, 60, {
          label: 'Ersatz anbieten nach',
          unit: 's',
          description: 'Klappt eine Pflege so lange nicht, erscheint die Ersatz-Bedienung.',
        }),
        fallbackHoldMs: int(1000, 200, 5000, { label: 'Ersatz-Taste halten', unit: 'ms' }),
        coverFallbackTouchPoints: int(2, 1, 5, {
          label: 'Zudecken-Ersatz: Finger',
          description: 'Erkennt ein Gerät die ganze Hand nicht, reichen so viele Finger.',
        }),
        hatchAnimationMs: int(2500, 500, 10000, { label: 'Schlüpf-Animation', unit: 'ms' }),
        settleMs: int(3000, 0, 20000, {
          label: 'Pause vor Runde 1',
          unit: 'ms',
          description: 'Nach der Rollen-Einblendung, bevor die erste Station beginnt.',
        }),
      },
      { label: 'Ausbrüten' },
    ),

    peek: group(
      {
        sampleIntervalMs: int(1000, 250, 5000, {
          label: 'Aufzeichnung alle',
          unit: 'ms',
          description: 'Takt der lückenlosen Aufzeichnung (Spick-Station).',
        }),
        enabled: bool(true, { label: 'Spick-Station aktiv' }),
        allowSelf: bool(false, { label: 'Eigene Station wählbar' }),
      },
      { label: 'Spick-Station' },
    ),

    hints: group(
      {
        perChick: int(3, 0, 10, { label: 'Vage Hinweise je Küken' }),
      },
      { label: 'Heimkehr' },
    ),

    voting: group(
      {
        tieBreak: z
          .enum(['runoff', 'nobody'])
          .default('runoff')
          .meta({ label: 'Bei Gleichstand', description: 'Stichwahl oder niemand beschuldigt.' }),
        maxRunoffs: int(1, 0, 3, { label: 'Höchstens Stichwahlen' }),
        revealAnimationMs: int(3000, 500, 10000, {
          label: 'Enthüllung (Umdrehen)',
          unit: 'ms',
        }),
      },
      { label: 'Abstimmung' },
    ),

    scoring: group(
      {
        survivalMin: num(0, 0, 1, {
          label: 'Überlebt ab Befinden',
          step: 0.05,
          description: 'Küken mit Befinden darüber gelten als überlebt.',
        }),
        happyMin: num(0.7, 0, 1, { label: 'Glücklich ab Befinden', step: 0.05 }),
      },
      { label: 'Wertung' },
    ),

    modules: modulesSchema,
  })
  .superRefine((c, ctx) => {
    if (c.room.maxPlayers < c.room.minPlayers) {
      ctx.addIssue({
        code: 'custom',
        path: ['room', 'maxPlayers'],
        message: 'Höchstens Spieler muss ≥ mindestens Spieler sein.',
      });
    }
    if (c.room.cuckooCount >= c.room.minPlayers) {
      ctx.addIssue({
        code: 'custom',
        path: ['room', 'cuckooCount'],
        message: 'Es muss mehr Pflegeeltern als Kuckucke geben.',
      });
    }
    const r = c.sensors.rock;
    if (!(r.gentleMin < r.gentleMax && r.gentleMax <= r.harshAbove)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sensors', 'rock'],
        message: 'Es muss gelten: sanft ab < sanft bis ≤ zu wild ab.',
      });
    }
    if (new Set(c.care.activeKinds).size !== c.care.activeKinds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['care', 'activeKinds'],
        message: 'Jede Pflegeart nur einmal.',
      });
    }
  });

export type GameConfig = z.infer<typeof GameConfigSchema>;
