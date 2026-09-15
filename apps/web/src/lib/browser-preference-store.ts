import { isThemePreference } from "@satisfactory-belt/preferences";
import type { PreferenceStore, UserPreferences } from "@satisfactory-belt/preferences";

const KEY = "satisfactory-belt:user-preferences";

/** Resolve storage lazily: browsers may deny access, which the caller handles as a failure. */
export function createBrowserPreferenceStore(
  storage: () => Pick<Storage, "getItem" | "setItem"> = () => window.localStorage,
): PreferenceStore {
  return {
    async load() {
      const raw = storage().getItem(KEY);
      if (!raw) return {};
      let saved: unknown;
      try {
        saved = JSON.parse(raw);
      } catch {
        return {};
      }
      if (saved === null || typeof saved !== "object") return {};
      return {
        ...("theme" in saved && isThemePreference(saved.theme) ? { theme: saved.theme } : {}),
        ...("gridSnapping" in saved && typeof saved.gridSnapping === "boolean"
          ? { gridSnapping: saved.gridSnapping }
          : {}),
        ...("showGrid" in saved && typeof saved.showGrid === "boolean"
          ? { showGrid: saved.showGrid }
          : {}),
        ...("showPerformance" in saved && typeof saved.showPerformance === "boolean"
          ? { showPerformance: saved.showPerformance }
          : {}),
      } satisfies Partial<UserPreferences>;
    },
    async save(preferences) {
      storage().setItem(KEY, JSON.stringify(preferences));
    },
  };
}
