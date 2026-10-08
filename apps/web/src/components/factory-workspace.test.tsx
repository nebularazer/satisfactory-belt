import { serializeFactoryJson } from "@satisfactory-belt/factory-saves";
import { Preferences } from "@satisfactory-belt/preferences";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";

import { App } from "@/App";
import { downloadFactoryJson } from "@/lib/browser-factory-files";
import { createBrowserPlanStore } from "@/lib/browser-plan-store";
import { createBrowserTheme } from "@/lib/browser-theme";
import { loadGameAssets } from "@/lib/game-assets";
import { minerFlowFixture } from "@/test/flow-fixture";

vi.mock("@/lib/browser-factory-files", () => ({ downloadFactoryJson: vi.fn() }));
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
async function rowAction(user: ReturnType<typeof userEvent.setup>, name: string, action: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: action }));
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
    await menu(user, "Save as…");
    const name = screen.getByRole("textbox", { name: "Factory name" });
    await user.clear(name);
    await user.type(name, "Steel factory");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const copy = (await store.loadActive())!;
    const original = copy.document;
    expect(copy.name).toBe("Steel factory");
    await menu(user, "Clear canvas…");
    await user.click(screen.getByRole("button", { name: "Clear canvas" }));
    await waitFor(async () => expect((await store.load(copy.id))?.document.nodes).toHaveLength(0));
    expect((await store.load(source.id))?.document).toEqual(original);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(false);
    await menu(user, "Save as…");
    await user.click(await screen.findByRole("button", { name: "Iron factory" }));
    await user.click(screen.getByRole("button", { name: "Overwrite…" }));
    await user.click(await screen.findByRole("button", { name: "Overwrite factory" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await store.loadActive())?.id).toBe(source.id);
    expect((await store.load(source.id))?.document.nodes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await store.load(source.id))?.document).toEqual(original));
    expect((await store.load(copy.id))?.document.nodes).toHaveLength(0);
    await menu(user, "Open factory…");
    await user.click(await screen.findByRole("button", { name: "Steel factory" }));
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(true);
    expect((await store.loadActive())?.id).toBe(copy.id);
    await menu(user, "Open factory…");
    await user.click(await screen.findByRole("button", { name: "Iron factory" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await menu(user, "Open factory…");
    await screen.findByRole("button", { name: "Iron factory" });
    await rowAction(user, "Iron factory", "Delete…");
    await user.click(screen.getByRole("button", { name: "Delete factory" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Iron factory" })).toBeNull());
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

it("exports the current canvas, imports with rename or overwrite, and rejects invalid files without changing saves", async () => {
  const user = userEvent.setup();
  Object.defineProperty(window, "indexedDB", { configurable: true, value: new IDBFactory() });
  const fixture = minerFlowFixture();
  vi.mocked(loadGameAssets).mockResolvedValue(fixture.assets);
  const store = await createBrowserPlanStore();
  const source = await store.create("Iron factory", fixture.document);
  const target = await store.create("Target", { nodes: [], links: [] });
  await store.select(source.id);
  const preferences = new Preferences({ load: async () => ({}), save: async () => {} }, vi.fn());
  const theme = createBrowserTheme(preferences);
  const app = render(<App preferences={preferences} theme={theme} />);
  async function upload(text: string) {
    if (!screen.queryByRole("dialog")) await menu(user, "Open factory…");
    await user.click(screen.getByRole("button", { name: "Open JSON…" }));
    const file = new File([text], "factory.json", { type: "application/json" });
    // jsdom has no Blob.text implementation.
    Object.defineProperty(file, "text", { value: async () => text });
    await user.upload(screen.getByLabelText("Import factory JSON"), file);
  }
  try {
    await screen.findByRole("button", { name: "Canvas menu" });
    await user.click(screen.getByRole("button", { name: "Canvas menu" }));
    expect(screen.queryByRole("menuitem", { name: /Import JSON|Export JSON/ })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: "Save as…" }));
    const beforeExport = await store.list();
    await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
    await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Portable factory");
    vi.mocked(downloadFactoryJson).mockImplementationOnce(() => {
      throw new Error("Download failed");
    });
    await user.click(screen.getByRole("button", { name: "Download JSON" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Download failed");
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Download JSON" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const exported = vi.mocked(downloadFactoryJson).mock.lastCall![0];
    expect(exported.name).toBe("Portable factory");
    expect(await store.list()).toEqual(beforeExport);
    expect((await store.loadActive())?.id).toBe(source.id);
    const text = serializeFactoryJson(exported);
    await upload(text);
    await screen.findByRole("button", { name: "Import" });
    await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
    await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Imported copy");
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const imported = (await store.loadActive())!;
    expect(imported.name).toBe("Imported copy");
    expect(imported.document).toEqual(exported.document);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Undo" }).disabled).toBe(true);
    await upload(text);
    await screen.findByRole("button", { name: "Import" });
    await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
    await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Target");
    await user.click(screen.getByRole("button", { name: "Import" }));
    await screen.findByRole("button", { name: "Overwrite factory" });
    expect((await store.load(target.id))?.document.nodes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await store.loadActive())?.id).toBe(target.id);
    expect((await store.load(target.id))?.document).toEqual(exported.document);
    const before = await store.list();
    await upload("{bad JSON");
    expect((await screen.findByRole("alert")).textContent).toContain("not valid JSON");
    expect(screen.getByRole("dialog", { name: "Open factory" })).toBeTruthy();
    expect(await store.list()).toEqual(before);
    expect((await store.loadActive())?.id).toBe(target.id);
    const broken = JSON.parse(text);
    broken.document.links[0].input.nodeId = "missing";
    await upload(JSON.stringify(broken));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("invalid"));
    expect(await store.list()).toEqual(before);
  } finally {
    await act(async () => app.unmount());
    theme.destroy();
    store.close();
  }
});

it("renames the current and another factory while preserving canvas, history and selected save destination", async () => {
  const user = userEvent.setup();
  Object.defineProperty(window, "indexedDB", { configurable: true, value: new IDBFactory() });
  const fixture = minerFlowFixture();
  vi.mocked(loadGameAssets).mockResolvedValue(fixture.assets);
  const store = await createBrowserPlanStore();
  const source = await store.create("Iron factory", fixture.document);
  const other = await store.create("Other factory", { nodes: [], links: [] });
  await store.select(source.id);
  const preferences = new Preferences({ load: async () => ({}), save: async () => {} }, vi.fn());
  const theme = createBrowserTheme(preferences);
  const app = render(<App preferences={preferences} theme={theme} />);
  try {
    await screen.findByRole("button", { name: "Canvas menu" });
    await menu(user, "Clear canvas…");
    await user.click(screen.getByRole("button", { name: "Clear canvas" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    const before = await store.load(source.id);
    await menu(user, "Open factory…");
    await rowAction(user, "Iron factory", "Rename…");
    const name = screen.getByRole("textbox", { name: "Factory name" });
    await user.clear(name);
    await user.type(name, "Steel factory");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await screen.findByRole("button", { name: "Steel factory" });
    expect(await store.loadActive()).toEqual({ ...before, name: "Steel factory" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Redo" }).disabled).toBe(false);
    await menu(user, "Save as…");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" }).value).toBe(
      "Steel factory",
    );
    await rowAction(user, "Other factory", "Rename…");
    await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
    await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Copper factory");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await screen.findByRole("button", { name: "Copper factory" });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" }).value).toBe(
      "Steel factory",
    );
    expect((await store.load(other.id))?.document.nodes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Download JSON" }));
    expect(vi.mocked(downloadFactoryJson).mock.lastCall![0]).toEqual({
      name: "Steel factory",
      document: before!.document,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(async () => expect((await store.loadActive())?.document.nodes).toHaveLength(0));
    expect((await store.loadActive())?.name).toBe("Steel factory");
  } finally {
    await act(async () => app.unmount());
    theme.destroy();
    store.close();
  }
});
