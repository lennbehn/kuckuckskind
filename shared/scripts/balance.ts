/**
 * Balancing: simuliert viele Partien mit Bots und schätzt, wie oft der Kuckuck gewinnt.
 *
 *   pnpm --filter @kuckuckskind/shared balance [--games 500] [--players 5] [--json '{"needs":{"tempo":1.2}}']
 *
 * Abstimmungs-Modell (grob, Menschen sind schwer zu simulieren): Am Tisch werden alle
 * Spick-Aufzeichnungen geteilt. Verdacht gegen einen Spieler = größter Befindens-Verlust,
 * der in einer Spick-Station bei ihm gesehen wurde, plus Rauschen für Diskussion und vage
 * Hinweise. Pflegeeltern wählen den Verdächtigsten, der Kuckuck den verdächtigsten anderen.
 * Zielwert laut CLAUDE.md: Kuckuck gewinnt ca. 4 von 10 Partien.
 */
import {
  createRng,
  earnsFalcon,
  featherFalls,
  harmByHolder,
  holderOf,
  mistakeMs,
  owlVerdict,
  phoneHeldBy,
  pickOwl,
  type StationStats,
  decideVote,
  peekOptions,
  peekRound,
  resolveConfig,
  scoreGame,
  simulateGame,
  tallyVotes,
  totalRounds,
  type ConfigOverride,
} from '../src/index.ts';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] as string) : def;
};
const games = Number(arg('games', '300'));
const players = Number(arg('players', '5'));
const noise = Number(arg('noise', '0.08'));
const config = resolveConfig(JSON.parse(arg('json', '{}')) as ConfigOverride);
// Wie stark ein Hinweis den Verdacht am Tisch erhöht (Spick-Verlust liegt typisch bei 0–0,35).
const featherWeight = Number(arg('featherWeight', '1')); // eine Feder ist (fast) ein Beweis
const falconWeight = Number(arg('falconWeight', '0.15'));
const owlWeight = Number(arg('owlWeight', '0.12'));
const stat = { feathers: 0, glances: 0, glanceHits: 0, owlHits: 0 };
const rounds = totalRounds(config, players);

let cuckooWins = 0;
let fosterWins = 0;
let none = 0;
let caught = 0;
let deaths = 0;
let happyFoster = 0;
let happyCuckoo = 0;
let fosterChicks = 0;
let cuckooChicks = 0;
const wellbeings: number[] = [];

for (let g = 0; g < games; g++) {
  const sim = simulateGame(config, { players, seed: 1000 + g });
  const rng = createRng(9000 + g);
  const { seating, roles, stats, chicks } = sim;

  // Spick-Wahl zufällig, Ergebnisse werden am Tisch geteilt.
  const suspicion: Record<string, number> = Object.fromEntries(seating.map((id) => [id, 0]));
  for (const owner of seating) {
    const options = peekOptions(owner, seating, rounds, config.peek.allowSelf);
    if (!options.length) continue;
    const target = rng.pick(options);
    const r = peekRound(owner, target, seating, rounds);
    const loss = r === null ? 0 : (stats[owner]?.[r]?.loss ?? 0);
    suspicion[target] = Math.max(suspicion[target] ?? 0, loss);
  }

  const stationMs = config.timing.stationSeconds * 1000;
  // Kuckucksfedern: Die nächste Person sieht die Feder und weiß, wer das Küken vorher hatte.
  for (const owner of seating) {
    (stats[owner] ?? []).forEach((st, r) => {
      const holder = holderOf(owner, r, seating);
      if (holder === owner) return;
      if (featherFalls(st, roles[holder]!, config, rng)) {
        stat.feathers++;
        suspicion[holder] = (suspicion[holder] ?? 0) + featherWeight;
      }
    });
  }
  // Falkenblick: Wer eine fremde Station sehr gut pflegt, schaut in einer späteren Station bei
  // einem zufälligen Mitspieler hin. Erwischt wird, wer in dem Moment falsch pflegt.
  const tokens: Record<string, number> = {};
  const earned: Record<string, number> = {};
  for (let r = 0; r < rounds; r++) {
    for (const owner of seating) {
      const st = stats[owner]?.[r];
      const holder = holderOf(owner, r, seating);
      // Blick einsetzen, falls vorhanden.
      if ((tokens[holder] ?? 0) > 0 && r > 0) {
        tokens[holder]!--;
        stat.glances++;
        const target = rng.pick(seating.filter((id) => id !== holder));
        const watched = stats[phoneHeldBy(target, r, seating)]?.[r];
        const window = config.modules.falcon.durationSeconds * 1000;
        // Fehlpflege-Anteil der Station; je länger der Blick, desto eher fällt sie auf
        // (bei 10 s Blick zählt der Anteil voll, darunter anteilig).
        const frac = watched ? Math.min(1, mistakeMs(watched) / stationMs) : 0;
        const p = Math.min(1, frac * 2 * Math.min(1, window / 10_000));
        if (rng.next() < p) {
          stat.glanceHits++;
          suspicion[target] = (suspicion[target] ?? 0) + falconWeight;
        }
      }
      if (
        st &&
        holder !== owner &&
        earnsFalcon(st, config) &&
        (earned[holder] ?? 0) < config.modules.falcon.maxTokens
      ) {
        earned[holder] = (earned[holder] ?? 0) + 1;
        tokens[holder] = (tokens[holder] ?? 0) + 1;
      }
    }
  }
  // Eule: beobachtet einen zufälligen Mitspieler und erzählt es am Tisch.
  const owl = pickOwl(roles, config, rng);
  if (owl) {
    const target = rng.pick(seating.filter((id) => id !== owl));
    const asRecord: Record<string, Record<string, StationStats>> = Object.fromEntries(
      seating.map((o) => [
        o,
        Object.fromEntries((stats[o] ?? []).map((st) => [String(st.round), st])),
      ]),
    );
    const level = owlVerdict(target, owl, harmByHolder(asRecord, seating));
    if (level === 'high') suspicion[target] = (suspicion[target] ?? 0) + owlWeight;
    if (level === 'low') suspicion[target] = (suspicion[target] ?? 0) - owlWeight / 2;
    if (roles[target] === 'cuckoo' && level === 'high') stat.owlHits++;
  }
  const votes = new Map<string, string>();
  for (const voter of seating) {
    const scored = seating
      .filter((id) => id !== voter)
      .map((id) => ({ id, s: (suspicion[id] ?? 0) + rng.next() * noise }))
      .sort((a, b) => b.s - a.s);
    votes.set(voter, (scored[0] as { id: string }).id);
  }
  let outcome = decideVote(tallyVotes(votes, seating), 0, config);
  if (outcome.kind === 'runoff') {
    const cands = outcome.candidates;
    const rv = new Map<string, string>();
    for (const voter of seating) {
      const opts = cands.filter((c) => c !== voter);
      if (opts.length)
        rv.set(voter, opts.sort((a, b) => (suspicion[b] ?? 0) - (suspicion[a] ?? 0))[0] as string);
    }
    outcome = decideVote(tallyVotes(rv, cands), 1, config);
  }
  const accusedId = outcome.kind === 'accused' ? outcome.playerId : null;
  const result = scoreGame({
    roles,
    chicks: Object.fromEntries(
      seating.map((id) => [id, { wellbeing: chicks[id]!.wellbeing, alive: chicks[id]!.alive }]),
    ),
    accusedId,
    config,
  });
  if (result.winner === 'cuckoo') cuckooWins++;
  else if (result.winner === 'fosters') fosterWins++;
  else none++;
  if (result.cuckooCaught) caught++;
  for (const id of seating) {
    const c = chicks[id]!;
    wellbeings.push(c.wellbeing);
    if (!c.alive) deaths++;
    const happy = result.happy.includes(id);
    if (roles[id] === 'cuckoo') {
      cuckooChicks++;
      if (happy) happyCuckoo++;
    } else {
      fosterChicks++;
      if (happy) happyFoster++;
    }
  }
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)} %`;
const avg = wellbeings.reduce((a, b) => a + b, 0) / wellbeings.length;
console.log(
  `Partien: ${games}, Spieler: ${players}, Runden: ${rounds}, Station: ${config.timing.stationSeconds} s`,
);
console.log(`Kuckuck gewinnt:        ${pct(cuckooWins, games)}   (Ziel ≈ 40 %)`);
console.log(`Pflegeeltern gewinnen:  ${pct(fosterWins, games)}`);
console.log(`Niemand:                ${pct(none, games)}`);
console.log(`Kuckuck enttarnt:       ${pct(caught, games)}`);
console.log(`Küken gestorben:        ${pct(deaths, games * players)}`);
console.log(`Glücklich (Pflegeeltern-Küken): ${pct(happyFoster, fosterChicks)}`);
console.log(`Glücklich (Kuckucks-Küken):     ${pct(happyCuckoo, cuckooChicks)}`);
console.log(`Befinden am Ende (Mittel): ${avg.toFixed(2)}`);
console.log(
  `Hinweise je Partie: Federn ${(stat.feathers / games).toFixed(2)}, Falkenblicke ${(stat.glances / games).toFixed(2)} (Treffer ${(stat.glanceHits / games).toFixed(2)}), Eule trifft Kuckuck mit „viel“: ${pct(stat.owlHits, games)}`,
);
