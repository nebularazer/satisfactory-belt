import { linkHandles } from "@satisfactory-belt/canvas-core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { minerFlowFixture } from "@/test/flow-fixture";

import { Inspector } from "./inspector";

afterEach(() => vi.restoreAllMocks());

it("keeps the mobile sheet closed during and after a drag, then opens on a completed tap", () => {
  const media = window.matchMedia("(max-width: 639px)");
  vi.spyOn(window, "matchMedia").mockReturnValue(Object.assign(media, { matches: true }));
  const { assets, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, { nodes: [smelter], links: [] });
  editor.controller.setGridSnapping(false);
  render(<Inspector editor={editor} assets={assets} focusCanvas={vi.fn()} />);
  const start = { id: 1, touch: true, x: smelter.x + 40, y: smelter.y + 20 };
  const end = { ...start, x: start.x + 48, y: start.y + 48 };
  act(() => editor.controller.pointerDown(start));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => editor.controller.pointerMove(end));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => editor.controller.pointerUp(end));
  expect(editor.getNode(smelter.id)).toMatchObject({ x: smelter.x + 48, y: smelter.y + 48 });
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => editor.controller.pointerDown(end));
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => editor.controller.pointerUp(end));
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("leaves the canvas accessible while a mobile link inspector is open and its handle is dragged", () => {
  const media = window.matchMedia("(max-width: 639px)");
  vi.spyOn(window, "matchMedia").mockReturnValue(Object.assign(media, { matches: true }));
  const { assets, document: plan } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, plan);
  editor.controller.selectLink("ore");
  render(
    <>
      <button type="button">Canvas surface</button>
      <Inspector editor={editor} assets={assets} focusCanvas={vi.fn()} />
    </>,
  );
  const sheet = screen.getByRole("dialog");
  expect(sheet.getAttribute("aria-modal")).not.toBe("true");
  expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Canvas surface" }));
  expect(editor.controller.getLinkSnapshot().selected).toBe("ore");
  const link = editor.controller.getSnapshot().links[0]!;
  const handle = linkHandles(link)[0]!;
  const start = { id: 1, touch: true, x: handle.x, y: handle.y };
  const end = { ...start, y: start.y + 48 };
  act(() => editor.controller.pointerDown(start));
  expect(editor.controller.getSnapshot().interaction).toBe("segment");
  act(() => editor.controller.pointerMove(end));
  expect(editor.controller.getLinkSnapshot().preview).not.toBeNull();
  expect(screen.getByRole("dialog")).toBe(sheet);
  act(() => editor.controller.pointerUp(end));
  expect(editor.getLink("ore")!.guides?.length).toBeGreaterThan(0);
  expect(editor.controller.getLinkSnapshot().selected).toBe("ore");
});
