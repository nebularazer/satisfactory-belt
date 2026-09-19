/** Residual network for fixed-rate material allocation. No recursion or game semantics. */
export class FlowNetwork {
  private readonly adjacent: Edge[][];
  private remainingWork = 2_000_000;
  private readonly epsilon: number;
  constructor(size: number, epsilon: number) {
    this.epsilon = epsilon;
    this.adjacent = Array.from({ length: size }, () => []);
  }
  add(from: number, to: number, capacity: number): Edge {
    const forward: Edge = { to, capacity, remaining: capacity, reverse: this.adjacent[to]!.length };
    const reverse: Edge = {
      to: from,
      capacity: 0,
      remaining: 0,
      reverse: this.adjacent[from]!.length,
    };
    this.adjacent[from]!.push(forward);
    this.adjacent[to]!.push(reverse);
    return forward;
  }
  /** Returns false on the work limit; callers must not publish a partial solution as valid. */
  solve(source: number, sink: number): boolean {
    const levels = new Int32Array(this.adjacent.length);
    const cursors = new Int32Array(this.adjacent.length);
    for (;;) {
      levels.fill(-1);
      levels[source] = 0;
      const queue = [source];
      for (let i = 0; i < queue.length; i++) {
        const from = queue[i]!;
        for (const edge of this.adjacent[from]!) {
          if (--this.remainingWork < 0) return false;
          if (edge.remaining <= this.epsilon || levels[edge.to] !== -1) continue;
          levels[edge.to] = levels[from]! + 1;
          queue.push(edge.to);
        }
      }
      if (levels[sink] === -1) return true;
      cursors.fill(0);
      for (;;) {
        const nodes = [source];
        const path: Edge[] = [];
        const limits = [Infinity];
        while (nodes.length && nodes.at(-1) !== sink) {
          const from = nodes.at(-1)!;
          const edges = this.adjacent[from]!;
          let edge: Edge | undefined;
          while (cursors[from]! < edges.length) {
            if (--this.remainingWork < 0) return false;
            const candidate = edges[cursors[from]!]!;
            if (candidate.remaining > this.epsilon && levels[candidate.to] === levels[from]! + 1) {
              edge = candidate;
              break;
            }
            cursors[from]!++;
          }
          if (edge) {
            nodes.push(edge.to);
            path.push(edge);
            limits.push(Math.min(limits.at(-1)!, edge.remaining));
          } else {
            levels[from] = -1;
            nodes.pop();
            path.pop();
            limits.pop();
          }
        }
        if (!nodes.length) break;
        const amount = limits.at(-1)!;
        for (const edge of path) {
          edge.remaining -= amount;
          this.adjacent[edge.to]![edge.reverse]!.remaining += amount;
        }
      }
    }
  }
}
export type Edge = { to: number; capacity: number; remaining: number; reverse: number };
