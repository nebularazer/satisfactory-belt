import type { PreferenceStore } from "@satisfactory-belt/preferences";

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
      return saved !== null &&
        typeof saved === "object" &&
        "gridSnapping" in saved &&
        typeof saved.gridSnapping === "boolean"
        ? { gridSnapping: saved.gridSnapping }
        : {};
    },
    async save(preferences) {
      storage().setItem(KEY, JSON.stringify(preferences));
    },
  };
}
