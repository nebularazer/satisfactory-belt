import { Preferences } from "@satisfactory-belt/preferences";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";

import { App } from "@/App";
import { createBrowserPlanStore } from "@/lib/browser-plan-store";
import { createBrowserTheme } from "@/lib/browser-theme";
import { loadGameAssets } from "@/lib/game-assets";
import { minerFlowFixture } from "@/test/flow-fixture";

vi.mock("@/lib/game-assets", () => ({ loadGameAssets: vi.fn() }));
vi.mock("@satisfactory-belt/canvas-pixi", () => ({
  mountCanvas: vi.fn(async (host: HTMLElement, _controller, options: { signal: AbortSignal }) => {
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    host.append(canvas);
    options.signal.addEventListener("abort", () => canvas.remove());
    return {
      focus: () => canvas.focus(),
      setTheme() {},
      setShowGrid() {},
      setShowPerformance() {},
      performance: null,
    };
  }),
}));

it("copies, autosaves, loads with fresh undo history, deletes the active save and saves its retained canvas", async () => {
  const user = userEvent.setup();
  Object.defineProperty(window, "indexedDB", { configurable: true, value: new IDBFactory() });
  const fixture = minerFlowFixture();
  vi.mocked(loadGameAssets).mockResolvedValue(fixture.assets);
  const store = await createBrowserPlanStore();
  const source = await store.create("Iron factory", fixture.document);
  const preferences = new Preferences({ load: async () => ({}), save: async () => {} }, vi.fn());
  const theme = createBrowserTheme(preferences);
  const app = render(<App preferences={preferences} theme={theme} />);
  try {
    const openFactory = await screen.findByRole("button", { name: "Iron factory" });
    const original = (await store.load(source.id))?.document;
    await user.click(openFactory);
    await user.click(screen.getByRole("button", { name: "Save as new…" }));
    const name = screen.getByRole("textbox", { name: "Factory name" });
    await user.clear(name);
    await user.type(name, "Steel factory");
    await user.click(screen.getByRole("button", { name: "Save as new" }));
    await screen.findByRole("button", { name: "Steel factory" });
    const copy = (await store.list()).find((saved) => saved.name === "Steel factory")!;
    await user.click(screen.getByRole("button", { name: "Canvas menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Clear canvas…" }));
    await user.click(screen.getByRole("button", { name: "Clear canvas" }));
    await waitFor(async () => expect((await store.load(copy.id))?.document.nodes).toHaveLength(0));
    expect((await store.load(source.id))?.document).toEqual(original);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "Steel factory" }));
    await user.click(await screen.findByRole("radio", { name: /Iron factory/ }));
    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByRole("button", { name: "Iron factory" });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(true);
    expect((await store.loadActive())?.id).toBe(source.id);
    await user.click(screen.getByRole("button", { name: "Iron factory" }));
    await screen.findByRole("radio", { name: /Iron factory/ });
    await user.click(screen.getByRole("button", { name: "Delete…" }));
    await user.click(screen.getByRole("button", { name: "Delete factory" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Iron factory/ })).toBeNull());
    expect(await store.load(source.id)).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Save as new…" }));
    await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
    await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Retained factory");
    await user.click(screen.getByRole("button", { name: "Save as new" }));
    await screen.findByRole("button", { name: "Retained factory" });
    expect((await store.loadActive())?.document).toEqual(original);
  } finally {
    await act(async () => app.unmount());
    theme.destroy();
    store.close();
  }
});
