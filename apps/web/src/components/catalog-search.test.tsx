import { render, screen, waitFor } from "@testing-library/react";
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
