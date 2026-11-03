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
