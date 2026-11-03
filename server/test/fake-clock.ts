/** Steuerbare Uhr mit Zeitplan – für deterministische Raum-Tests. */
export class FakeClock {
  t = 1_000_000;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 0;

  now = () => this.t;

  schedule = (at: number, fn: () => void) => {
    const id = this.nextId++;
    this.tasks.push({ at, fn, id });
    return () => {
      this.tasks = this.tasks.filter((x) => x.id !== id);
    };
  };

  /** Zeit vorspulen und fällige Aufgaben der Reihe nach ausführen. */
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.tasks[0];
      if (!next || next.at > end) break;
      this.tasks.shift();
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = end;
  }

  get pending() {
    return this.tasks.length;
  }
}
