export const CANVAS_PREFERENCES = {
  performance: "satisfactory-belt-performance-metrics",
  snapToGrid: "satisfactory-belt-snap-to-grid",
} as const;

export function readBooleanPreference(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeBooleanPreference(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The canvas remains usable when storage is unavailable.
  }
}
