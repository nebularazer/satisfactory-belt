import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { inspectorAssets } from "@/test/inspector-fixture";

import { CatalogSearch } from "./catalog-search";

const finalFocus = () => null;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  // jsdom does not implement the Web Animations API used by the scroll area.
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
});

it.each(["ArrowDown", "ArrowUp"])(
  "places only the keyboard-selected result once after hover and %s",
  async (key) => {
    const user = userEvent.setup();
    const assets = inspectorAssets();
    assets.catalog.buildings!.second = {
      ...assets.catalog.buildings!.augmenter!,
      id: "second",
      name: "Second Augmenter",
    };
    const add = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <CatalogSearch
          assets={assets}
          open={open}
          onOpenChange={setOpen}
          finalFocus={finalFocus}
          onAdd={add}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.hover(await screen.findByRole("row", { name: /Alien Power Augmenter/ }));
    await user.keyboard(`{${key}}{Enter}`);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![0]).toMatchObject({ name: "Second Augmenter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
);

it("opens details with Alt+Enter after hovering without placing a building", async () => {
  const user = userEvent.setup();
  const add = vi.fn();
  render(
    <CatalogSearch
      assets={inspectorAssets()}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      onAdd={add}
    />,
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox")));
  await user.hover(await screen.findByRole("row", { name: /Alien Power Augmenter/ }));
  await user.keyboard("{Alt>}{Enter}{/Alt}");
  expect(add).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Back to results" })).toBeTruthy();
});

it("leaves the first mobile catalog body gesture available for native scrolling", async () => {
  const media = window.matchMedia("(max-width: 639px)");
  vi.spyOn(window, "matchMedia").mockReturnValue(Object.assign(media, { matches: true }));
  render(
    <CatalogSearch
      assets={inspectorAssets()}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
    />,
  );
  const row = await screen.findByRole("row", { name: /Alien Power Augmenter/ });
  // jsdom has no hit testing or native scrolling; verify that the drawer does not
  // cancel the first touchmove, which would prevent the browser from scrolling.
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => row });
  try {
    const start = { identifier: 1, clientX: 100, clientY: 300, target: row };
    fireEvent.touchStart(row, { touches: [start], changedTouches: [start] });
    const end = { ...start, clientY: 220 };
    const move = createEvent.touchMove(row, {
      touches: [end],
      changedTouches: [end],
      cancelable: true,
    });
    fireEvent(row, move);
    expect(move.defaultPrevented).toBe(false);
    fireEvent.touchEnd(row, { touches: [], changedTouches: [end] });
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).not.toBe("true");
    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog")).toBeTruthy();
  } finally {
    Reflect.deleteProperty(document, "elementFromPoint");
  }
});

it("removes the closed mobile catalog immediately so another sheet can open", () => {
  const media = window.matchMedia("(max-width: 639px)");
  vi.spyOn(window, "matchMedia").mockReturnValue(Object.assign(media, { matches: true }));
  const assets = inspectorAssets();
  const onOpenChange = vi.fn();
  const { rerender } = render(
    <CatalogSearch assets={assets} open onOpenChange={onOpenChange} finalFocus={finalFocus} />,
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  rerender(
    <CatalogSearch
      assets={assets}
      open={false}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
    />,
  );
  expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
});
