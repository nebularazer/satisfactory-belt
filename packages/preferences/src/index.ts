export type ThemePreference = "light" | "system" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "system" || value === "dark";
}

export type UserPreferences = Readonly<{
  theme: ThemePreference;
  gridSnapping: boolean;
  showGrid: boolean;
  showPerformance: boolean;
}>;

/** A store is scoped to the current user. Missing values use defaults; failures reject. */
export interface PreferenceStore {
  load(): Promise<Partial<UserPreferences>>;
  save(preferences: UserPreferences): Promise<void>;
}

/** Immediate local updates, ordered persistence, and protection against stale async loads. */
export class Preferences {
  private value: UserPreferences = {
    theme: "system",
    gridSnapping: true,
    showGrid: true,
    showPerformance: false,
  };
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
        if (!this.changed) {
          const gridSnapping =
            typeof saved.gridSnapping === "boolean" ? saved.gridSnapping : this.value.gridSnapping;
          const showGrid =
            typeof saved.showGrid === "boolean" ? saved.showGrid : this.value.showGrid;
          const showPerformance =
            typeof saved.showPerformance === "boolean"
              ? saved.showPerformance
              : this.value.showPerformance;
          const theme = isThemePreference(saved.theme) ? saved.theme : this.value.theme;
          if (
            theme === this.value.theme &&
            gridSnapping === this.value.gridSnapping &&
            showGrid === this.value.showGrid &&
            showPerformance === this.value.showPerformance
          )
            return;
          this.value = { theme, gridSnapping, showGrid, showPerformance };
          this.emit();
        }
      })
      .catch(this.onError);
    return this.loading;
  }

  setTheme = (theme: ThemePreference) => {
    if (theme === this.value.theme) return;
    this.update({ ...this.value, theme });
  };

  setGridSnapping = (gridSnapping: boolean) => {
    if (gridSnapping === this.value.gridSnapping) return;
    this.update({ ...this.value, gridSnapping });
  };

  setShowGrid = (showGrid: boolean) => {
    if (showGrid === this.value.showGrid) return;
    this.update({ ...this.value, showGrid });
  };

  setShowPerformance = (showPerformance: boolean) => {
    if (showPerformance === this.value.showPerformance) return;
    this.update({ ...this.value, showPerformance });
  };

  private update(value: UserPreferences) {
    this.changed = true;
    this.value = value;
    this.emit();
    const snapshot = this.value;
    // A slow remote save cannot finish after a newer save and overwrite it.
    this.writing = this.writing.then(() => this.store.save(snapshot)).catch(this.onError);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
