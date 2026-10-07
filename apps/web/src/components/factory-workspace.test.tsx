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

async function menu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Canvas menu" }));
  await user.click(await screen.findByRole("menuitem", { name }));
}

it("saves, overwrites, autosaves, opens with fresh history, and retains a deleted canvas", async () => {
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
    await screen.findByRole("button", { name: "Canvas menu" });
    expect(screen.queryByRole("button", { name: "Iron factory" })).toBeNull();
    const original = (await store.load(source.id))?.document;
    await menu(user, "Save as…");
    const name = screen.getByRole("textbox", { name: "Factory name" });
    await user.clear(name);
    await user.type(name, "Steel factory");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const copy = (await store.loadActive())!;
    expect(copy.name).toBe("Steel factory");
    await menu(user, "Clear canvas…");
    await user.click(screen.getByRole("button", { name: "Clear canvas" }));
    await waitFor(async () => expect((await store.load(copy.id))?.document.nodes).toHaveLength(0));
    expect((await store.load(source.id))?.document).toEqual(original);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(false);
    await menu(user, "Save as…");
    await user.click(await screen.findByRole("radio", { name: /Iron factory/ }));
    await user.click(screen.getByRole("button", { name: "Overwrite…" }));
    await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await store.loadActive())?.id).toBe(source.id);
    expect((await store.load(source.id))?.document.nodes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await store.load(source.id))?.document).toEqual(original));
    expect((await store.load(copy.id))?.document.nodes).toHaveLength(0);
    await menu(user, "Open factory…");
    await user.click(await screen.findByRole("radio", { name: /Steel factory/ }));
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(true);
    expect((await store.loadActive())?.id).toBe(copy.id);
    await menu(user, "Open factory…");
    await user.click(await screen.findByRole("radio", { name: /Iron factory/ }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await menu(user, "Open factory…");
    await screen.findByRole("radio", { name: /Iron factory/ });
    await user.click(screen.getByRole("button", { name: "Delete…" }));
    await user.click(screen.getByRole("button", { name: "Delete factory" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Iron factory/ })).toBeNull());
    expect(await store.load(source.id)).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await menu(user, "Save as…");
    await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
    await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Retained factory");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await store.loadActive())?.document).toEqual(original);
  } finally {
    await act(async () => app.unmount());
    theme.destroy();
    store.close();
  }
});
