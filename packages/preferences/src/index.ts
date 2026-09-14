export type UserPreferences = Readonly<{ gridSnapping: boolean }>;

/** A store is scoped to the current user. Missing values use defaults; failures reject. */
export interface PreferenceStore {
  load(): Promise<Partial<UserPreferences>>;
  save(preferences: UserPreferences): Promise<void>;
}

/** Immediate local updates, ordered persistence, and protection against stale async loads. */
export class Preferences {
  private value: UserPreferences = { gridSnapping: true };
  private store: PreferenceStore;
  private onError: (error: unknown) => void;
  private listeners = new Set<() => void>();
  private changed = false;
  private loading: Promise<void> | undefined;
  private writing = Promise.resolve();

  constructor(store: PreferenceStore, onError: (error: unknown) => void) {
    this.store = store;
    this.onError = onError;
  }

  getSnapshot = (): UserPreferences => this.value;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  load(): Promise<void> {
    this.loading ??= this.store
      .load()
      .then((saved) => {
        // A user change made while loading always wins over the saved value.
        if (!this.changed && typeof saved.gridSnapping === "boolean") {
          this.value = { gridSnapping: saved.gridSnapping };
          this.emit();
        }
      })
      .catch(this.onError);
    return this.loading;
  }

  setGridSnapping = (gridSnapping: boolean) => {
    if (gridSnapping === this.value.gridSnapping) return;
    this.changed = true;
    this.value = { ...this.value, gridSnapping };
    this.emit();
    const snapshot = this.value;
    // A slow remote save cannot finish after a newer save and overwrite it.
    this.writing = this.writing.then(() => this.store.save(snapshot)).catch(this.onError);
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
