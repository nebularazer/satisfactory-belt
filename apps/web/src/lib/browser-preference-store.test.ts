import { expect, it, vi } from "vitest";

import { createBrowserPreferenceStore } from "./browser-preference-store";

it.each(["light", "system", "dark"] as const)(
  "round-trips %s through a fresh adapter",
  async (theme) => {
    const data = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    });
    await createBrowserPreferenceStore(storage).save({
      gridSnapping: true,
      showGrid: false,
      showPerformance: true,
      theme,
    });
    expect(await createBrowserPreferenceStore(storage).load()).toEqual({
      gridSnapping: true,
      showGrid: false,
      showPerformance: true,
      theme,
    });
  },
);

it.each([
  '{"theme":"sepia"}',
  '{"theme":true}',
  null,
  "broken json",
  "null",
  "[]",
  '{"gridSnapping":"false"}',
  '{"showGrid":"false"}',
  '{"showPerformance":"true"}',
])("ignores absent or invalid saved data: %s", async (raw) => {
  const store = createBrowserPreferenceStore(() => ({ getItem: () => raw, setItem: vi.fn() }));
  expect(await store.load()).toEqual({});
});

it("reports browser storage access failures to the preferences module", async () => {
  const denied = new Error("Storage unavailable");
  const store = createBrowserPreferenceStore(() => {
    throw denied;
  });
  await expect(store.load()).rejects.toThrow(denied);
  await expect(
    store.save({ gridSnapping: false, showGrid: true, showPerformance: false, theme: "system" }),
  ).rejects.toThrow(denied);
});

it.each([
  ['{"theme":"dark","showGrid":"false"}', { theme: "dark" }],
  ['{"theme":"invalid","showGrid":false}', { showGrid: false }],
  ['{"gridSnapping":false}', { gridSnapping: false }],
  ['{"showGrid":false}', { showGrid: false }],
  ['{"showGrid":false,"gridSnapping":"false"}', { showGrid: false }],
  ['{"showGrid":null,"gridSnapping":false}', { gridSnapping: false }],
  ['{"showPerformance":true,"showGrid":null}', { showPerformance: true }],
])("loads each valid preference independently: %s", async (raw, expected) => {
  const store = createBrowserPreferenceStore(() => ({ getItem: () => raw, setItem: vi.fn() }));
  expect(await store.load()).toEqual(expected);
});
