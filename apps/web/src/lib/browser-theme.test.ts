import { Preferences } from "@satisfactory-belt/preferences";
import { expect, it, vi } from "vitest";

import { createBrowserTheme } from "./browser-theme";

it("follows live system changes, respects overrides, and releases subscriptions", () => {
  const events = new EventTarget();
  const media = {
    matches: true,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const root = {
    classList: { toggle: vi.fn() },
    style: { colorScheme: "" },
  };
  const save = vi.fn(async () => {});
  const preferences = new Preferences({ load: async () => ({}), save }, vi.fn());
  const theme = createBrowserTheme(preferences, media, root);
  const listener = vi.fn();
  const unsubscribe = theme.subscribe(listener);
  expect(theme.getSnapshot()).toBe("dark");
  expect(root.style.colorScheme).toBe("dark");
  expect(root.classList.toggle).toHaveBeenLastCalledWith("dark", true);

  media.matches = false;
  events.dispatchEvent(new Event("change"));
  expect(theme.getSnapshot()).toBe("light");
  expect(root.classList.toggle).toHaveBeenLastCalledWith("dark", false);
  expect(save).not.toHaveBeenCalled();
  preferences.setTheme("dark");
  expect(theme.getSnapshot()).toBe("dark");
  media.matches = true;
  events.dispatchEvent(new Event("change"));
  media.matches = false;
  events.dispatchEvent(new Event("change"));
  expect(theme.getSnapshot()).toBe("dark");
  expect(listener).toHaveBeenCalledTimes(2);

  preferences.setTheme("light");
  media.matches = true;
  events.dispatchEvent(new Event("change"));
  expect(theme.getSnapshot()).toBe("light");
  preferences.setTheme("system");
  expect(theme.getSnapshot()).toBe("dark");
  preferences.setShowGrid(false);
  expect(listener).toHaveBeenCalledTimes(4);

  unsubscribe();
  preferences.setTheme("light");
  expect(listener).toHaveBeenCalledTimes(4);
  theme.destroy();
  preferences.setTheme("system");
  events.dispatchEvent(new Event("change"));
  expect(root.style.colorScheme).toBe("light");
});
