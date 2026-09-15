import type { Preferences } from "@satisfactory-belt/preferences";

/** Keeps the document and canvas on the same resolved theme, including live OS changes. */
export function createBrowserTheme(
  preferences: Preferences,
  media: Pick<
    MediaQueryList,
    "matches" | "addEventListener" | "removeEventListener"
  > = window.matchMedia("(prefers-color-scheme: dark)"),
  root: {
    classList: Pick<DOMTokenList, "toggle">;
    style: Pick<CSSStyleDeclaration, "colorScheme">;
  } = document.documentElement,
) {
  function resolve(): "light" | "dark" {
    const { theme } = preferences.getSnapshot();
    return theme === "system" ? (media.matches ? "dark" : "light") : theme;
  }
  let value = resolve();
  const listeners = new Set<() => void>();
  function apply() {
    root.classList.toggle("dark", value === "dark");
    root.style.colorScheme = value;
  }
  function update() {
    const next = resolve();
    if (next === value) return;
    value = next;
    apply();
    for (const listener of listeners) listener();
  }
  apply();
  const unsubscribe = preferences.subscribe(update);
  media.addEventListener("change", update);
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      unsubscribe();
      media.removeEventListener("change", update);
      listeners.clear();
    },
  };
}

export type BrowserTheme = ReturnType<typeof createBrowserTheme>;
