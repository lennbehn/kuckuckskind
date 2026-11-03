import {
  describePeek,
  type GameConfig,
  type RoomView,
  type StationStats,
} from '@kuckuckskind/shared';
import { useGameClient } from '../net/hooks.ts';
import { useChickRunner, useRunnerView } from '../game/runnerHost.tsx';
import { Chick } from './game/Chick.tsx';

/**
 * Heimkehr: Das Handy ist wieder beim Eigentümer. Sein Küken erzählt vage, wie es ihm ging
 * (ohne Namen und Reihenfolge), und genau, was bei der Spick-Station passiert ist.
 */
export function Homecoming({ room }: { room: RoomView }) {
  const client = useGameClient();
  const runner = useChickRunner();
  const view = useRunnerView(runner);
  const me = room.you.playerId;
  const isHost = room.hostId === me;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const story = room.you.story;
  const mine = room.chicks?.[me];

  return (
    <main className="paper">
      <h1 className="small">Heimkehr</h1>
      {view ? (
        <Chick state={view.state} config={room.config} size={150} />
      ) : (
        mine && <p className="lead">Befinden: {Math.round(mine.wellbeing * 100)} %</p>
      )}
      <p className="lead">
        {mine && !mine.alive
          ? 'Dein Küken hat es nicht geschafft …'
          : 'Dein Küken ist wieder da und erzählt:'}
      </p>

      <section className="card story">
        {(story?.hints ?? []).map((h) => (
          <p key={h} className="quote">
            „{h}“
          </p>
        ))}
        {!story && <p className="hint">Einen Moment …</p>}
      </section>

      {story?.peek && (
        <section className="card story">
          <h2>Bei {nameOf(story.peek.targetId)} habe ich genau hingeschaut:</h2>
          <PeekChart stats={story.peek.stats} config={room.config} />
          <ul className="peek-lines">
            {describePeek(story.peek.stats).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Alle Küken</h2>
        <ul className="chick-list">
          {room.players.map((p) => {
            const c = room.chicks?.[p.id];
            return (
              <li key={p.id}>
                <span>{p.name}</span>
                <span>
                  {!c
                    ? '…'
                    : !c.alive
                      ? '🪶 nicht mehr da'
                      : `${c.wellbeing >= room.config.scoring.happyMin ? '🐥' : '🐤'} ${Math.round(c.wellbeing * 100)} %`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {isHost ? (
        <button className="primary big" onClick={() => client.control('startVoting')}>
          Zur Abstimmung
        </button>
      ) : (
        <p className="note">
          Erzählt euch, was eure Küken erlebt haben. Der Host startet die Abstimmung.
        </p>
      )}
    </main>
  );
}

/** Verlauf von Befinden (dick) und Bedürfnissen während der Spick-Station; Punkte = Pflege. */
function PeekChart({ stats, config }: { stats: StationStats; config: GameConfig }) {
  const s = stats.samples;
  if (s.length < 2) return null;
  const w = 300;
  const h = 90;
  const maxT = Math.max(1, s[s.length - 1]!.t);
  const x = (t: number) => (t / maxT) * w;
  const y = (v: number) => h - v * h;
  const line = (f: (i: number) => number) =>
    s.map((p, i) => `${x(p.t).toFixed(1)},${y(f(i)).toFixed(1)}`).join(' ');
  const colors = ['#d0503c', '#5082d2', '#8c5abe', '#c89632', '#788c78'];
  return (
    <svg
      className="peek-chart"
      viewBox={`0 0 ${w} ${h + 12}`}
      role="img"
      aria-label="Verlauf während der Spick-Station"
    >
      {config.care.activeKinds.map((_, k) => (
        <polyline
          key={k}
          points={line((i) => s[i]!.n[k] ?? 0)}
          fill="none"
          stroke={colors[k]}
          strokeWidth="1.2"
          opacity="0.6"
        />
      ))}
      <polyline points={line((i) => s[i]!.w)} fill="none" stroke="#3b3226" strokeWidth="2.5" />
      {s.map((p, i) =>
        p.c.includes('rough') ? (
          <circle key={i} cx={x(p.t)} cy={h + 6} r="2.5" fill="#b5523b" />
        ) : p.c.length ? (
          <circle key={i} cx={x(p.t)} cy={h + 6} r="1.5" fill="#7e8f55" />
        ) : null,
      )}
    </svg>
  );
}
