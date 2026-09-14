import { expect, it, vi } from "vitest";

import { createBrowserPreferenceStore } from "./browser-preference-store";

it("round-trips a disabled preference through a fresh adapter", async () => {
  const data = new Map<string, string>();
  const storage = () => ({
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  });
  await createBrowserPreferenceStore(storage).save({ gridSnapping: false });
  expect(await createBrowserPreferenceStore(storage).load()).toEqual({ gridSnapping: false });
});

it.each([null, "broken json", "null", "[]", '{"gridSnapping":"false"}'])(
  "ignores absent or invalid saved data: %s",
  async (raw) => {
    const store = createBrowserPreferenceStore(() => ({ getItem: () => raw, setItem: vi.fn() }));
    expect(await store.load()).toEqual({});
  },
);

it("reports browser storage access failures to the preferences module", async () => {
  const denied = new Error("Storage unavailable");
  const store = createBrowserPreferenceStore(() => {
    throw denied;
  });
  await expect(store.load()).rejects.toThrow(denied);
  await expect(store.save({ gridSnapping: false })).rejects.toThrow(denied);
});
