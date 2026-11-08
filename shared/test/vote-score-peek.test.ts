import { describe, expect, it } from 'vitest';
import {
  decideVote,
  peekOptions,
  peekRound,
  resolveConfig,
  scoreGame,
  simulateGame,
  tallyVotes,
  holderOf,
} from '../src/index.ts';

const config = resolveConfig();
const seating = ['a', 'b', 'c', 'd'];

describe('Spick-Wahl', () => {
  it('nur Mitspieler, die das Küken auch halten', () => {
    expect(peekOptions('a', seating, 4, false)).toEqual(['b', 'c', 'd']);
    expect(peekOptions('a', seating, 2, false)).toEqual(['b']);
    expect(peekOptions('a', seating, 2, true)).toEqual(['a', 'b']);
  });

  it('findet die passende Runde', () => {
    const r = peekRound('a', 'c', seating, 4)!;
    expect(holderOf('a', r, seating)).toBe('c');
    expect(peekRound('a', 'd', seating, 2)).toBeNull();
  });
});

describe('Abstimmung', () => {
  it('zählt nur Stimmen für Kandidaten', () => {
    expect(tallyVotes({ a: 'b', b: 'c', c: 'b', d: 'x' }, seating)).toEqual({
      a: 0,
      b: 2,
      c: 1,
      d: 0,
    });
  });

  it('meiste Stimmen gewinnen', () => {
    expect(decideVote({ a: 0, b: 2, c: 1 }, 0, config)).toEqual({ kind: 'accused', playerId: 'b' });
  });

  it('Gleichstand → Stichwahl, danach niemand', () => {
    expect(decideVote({ a: 2, b: 2, c: 0 }, 0, config)).toEqual({
      kind: 'runoff',
      candidates: ['a', 'b'],
    });
    expect(decideVote({ a: 1, b: 1 }, 1, config)).toEqual({ kind: 'nobody', reason: 'tie' });
    expect(
      decideVote({ a: 2, b: 2 }, 0, resolveConfig({ voting: { tieBreak: 'nobody' } })),
    ).toMatchObject({ kind: 'nobody' });
  });

  it('ohne Stimmen niemand', () => {
    expect(decideVote({ a: 0, b: 0 }, 0, config)).toEqual({ kind: 'nobody', reason: 'no_votes' });
  });
});

describe('Wertung', () => {
  const roles = { a: 'foster', b: 'cuckoo', c: 'foster' } as const;
  const ok = { wellbeing: 0.8, alive: true };
  const sad = { wellbeing: 0.3, alive: true };
  const dead = { wellbeing: 0, alive: false };

  it('Pflegeeltern: alle überleben und Kuckuck enttarnt', () => {
    expect(
      scoreGame({ roles: { ...roles }, chicks: { a: ok, b: ok, c: ok }, accusedId: 'b', config })
        .winner,
    ).toBe('fosters');
  });

  it('Kuckuck: unentdeckt', () => {
    expect(
      scoreGame({ roles: { ...roles }, chicks: { a: ok, b: ok, c: ok }, accusedId: 'a', config })
        .winner,
    ).toBe('cuckoo');
    expect(
      scoreGame({ roles: { ...roles }, chicks: { a: ok, b: ok, c: ok }, accusedId: null, config })
        .winner,
    ).toBe('cuckoo');
  });

  it('Kuckuck: nur sein Küken glücklich – auch wenn enttarnt', () => {
    const r = scoreGame({
      roles: { ...roles },
      chicks: { a: sad, b: ok, c: sad },
      accusedId: 'b',
      config,
    });
    expect(r.onlyCuckooHappy).toBe(true);
    expect(r.winner).toBe('cuckoo');
  });

  it('enttarnt, aber ein Küken gestorben → niemand', () => {
    const r = scoreGame({
      roles: { ...roles },
      chicks: { a: dead, b: ok, c: ok },
      accusedId: 'b',
      config,
    });
    expect(r.allSurvived).toBe(false);
    expect(r.winner).toBe('none');
  });

  it('ohne Kuckuck gemeinsam', () => {
    const fam = { a: 'foster', b: 'foster' } as const;
    expect(
      scoreGame({ roles: { ...fam }, chicks: { a: ok, b: sad }, accusedId: null, config }).winner,
    ).toBe('fosters');
    expect(
      scoreGame({ roles: { ...fam }, chicks: { a: ok, b: dead }, accusedId: null, config }).winner,
    ).toBe('none');
  });
});

describe('Partie-Simulation mit Bots', () => {
  it('ist reproduzierbar und liefert eine Statistik je Küken und Runde', () => {
    const a = simulateGame(config, { players: 4, seed: 7 });
    const b = simulateGame(config, { players: 4, seed: 7 });
    expect(a.chicks).toEqual(b.chicks);
    for (const id of a.seating) expect(a.stats[id]).toHaveLength(4);
  });

  it('gute Pflegeeltern halten Küken am Leben; der Kuckuck schadet messbar', () => {
    let fosterLoss = 0;
    let cuckooLoss = 0;
    let fosterN = 0;
    let cuckooN = 0;
    for (let seed = 0; seed < 20; seed++) {
      const g = simulateGame(config, { players: 5, seed });
      for (const owner of g.seating) {
        expect(g.chicks[owner]!.alive).toBe(true);
        g.stats[owner]!.forEach((st, r) => {
          const holder = holderOf(owner, r, g.seating);
          if (holder === owner) return;
          if (g.roles[holder] === 'cuckoo') {
            cuckooLoss += st.loss;
            cuckooN++;
          } else {
            fosterLoss += st.loss;
            fosterN++;
          }
        });
      }
    }
    expect(cuckooLoss / cuckooN).toBeGreaterThan((fosterLoss / fosterN) * 2);
  });
});
