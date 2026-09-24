import { act, render, screen } from "@testing-library/react";
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
