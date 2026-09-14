export type HistorySnapshot<State> = Readonly<{
  state: State;
  canUndo: boolean;
  canRedo: boolean;
}>;

type Entry<State> = { before: State; after: State };

/**
 * Host-owned, bounded history of immutable document states. Updates must not mutate
 * their input; return the same reference for a no-op. Unchanged data stays shared.
 * Reuse a group token for consecutive updates in one gesture (e.g. a held arrow key).
 */
export class EditHistory<State> {
  private snapshot: HistorySnapshot<State>;
  private past: Entry<State>[] = [];
  private future: Entry<State>[] = [];
  private group: object | undefined;
  private limit: number;
  private listeners = new Set<() => void>();

  constructor(initialState: State, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("History limit must be positive");
    this.limit = limit;
    this.snapshot = { state: initialState, canUndo: false, canRedo: false };
  }

  getSnapshot = (): HistorySnapshot<State> => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(transform: (state: State) => State, group?: object) {
    const before = this.snapshot.state;
    // Compute first: a failed update must not change the document or history.
    const after = transform(before);
    if (after === before) return;
    const previous = this.past.at(-1);
    if (group && group === this.group && previous) previous.after = after;
    else {
      this.past.push({ before, after });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.group = group;
    this.publish(after);
  }

  undo = () => {
    this.group = undefined;
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push(entry);
    this.publish(entry.before);
  };

  redo = () => {
    this.group = undefined;
    const entry = this.future.pop();
    if (!entry) return;
    this.past.push(entry);
    this.publish(entry.after);
  };

  private publish(state: State) {
    this.snapshot = { state, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    for (const listener of this.listeners) listener();
  }
}
