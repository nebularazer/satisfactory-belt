import { createSearchIndex } from "@satisfactory-belt/game-data/search";
import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { minerFlowFixture } from "@/test/flow-fixture";
import { inspectorAssets } from "@/test/inspector-fixture";

import { CatalogSearch } from "./catalog-search";

const finalFocus = () => null;
const oreConnectionContext = { direction: "consumes" as const, itemIds: ["copper"] };
const matchMedia = vi.mocked(window.matchMedia).getMockImplementation()!;
beforeEach(() => {
  vi.mocked(window.matchMedia).mockImplementation(matchMedia);
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

function recipeAssets() {
  const { assets } = minerFlowFixture();
  assets.catalog.recipes.alternative = {
    ...assets.catalog.recipes.ingot!,
    id: "alternative",
    name: "Alternate: Pure Iron",
    alternate: true,
    products: [{ itemId: "iron", amount: 2 }],
  };
  return assets;
}

it("returns from recipe details to scoped results before leaving the machine scope", async () => {
  const user = userEvent.setup();
  const add = vi.fn();
  render(
    <CatalogSearch
      assets={recipeAssets()}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      onAdd={add}
    />,
  );
  const input = screen.getByRole("combobox");
  await waitFor(() => expect(document.activeElement).toBe(input));
  await user.type(input, "smelter");
  await user.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "Smelter · Recipes" })).toBeTruthy();
  await user.type(screen.getByRole("combobox"), "iron");
  await user.click(screen.getByRole("button", { name: "Details for Pure Iron" }));
  await user.click(screen.getByRole("button", { name: "Back to results" }));
  expect(screen.getByRole("heading", { name: "Smelter · Recipes" })).toBeTruthy();
  expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("iron");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox")));
  const activeId = screen.getByRole("combobox").getAttribute("aria-activedescendant")!;
  expect(document.getElementById(activeId)?.textContent).toContain("Pure Iron");
  await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
  expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("smelter");
  expect(screen.getByRole("heading", { name: "Search catalog" })).toBeTruthy();
  expect(add).not.toHaveBeenCalled();
});

it("keeps the first recipe as comparison baseline while browsing and places the displayed alternative", async () => {
  const user = userEvent.setup();
  const add = vi.fn();
  render(
    <CatalogSearch
      assets={recipeAssets()}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      onAdd={add}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Details for Iron Ingot" }));
  expect(screen.getByText("Compared with Iron Ingot at 30/min Iron Ingot")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Machines: 0.5; less than baseline recipe/ }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Details for Pure Iron" }));
  expect(screen.getByText("Compared with Iron Ingot at 30/min Iron Ingot")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Machines: 1; same as baseline recipe/ })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Place Smelter" }));
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0]![0]).toMatchObject({ entityId: "alternative" });
});

it("switches between producers and consumers and explains the active placement action", async () => {
  const user = userEvent.setup();
  render(
    <CatalogSearch
      assets={recipeAssets()}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      onAdd={vi.fn()}
    />,
  );
  await user.type(screen.getByRole("combobox"), "iron ore");
  expect(screen.getByRole("row", { name: /Iron Ore.*Miner Mk.2/s })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Consumes" }));
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.getAllByText("Consumes 30/min · Iron Ore")).toHaveLength(2);
  expect(screen.getByText(/Enter Place/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Produces" }));
  expect(screen.getAllByRole("row")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Names" }));
  await user.clear(screen.getByRole("combobox"));
  await user.type(screen.getByRole("combobox"), "smelter");
  expect(screen.getByText(/Enter Choose/)).toBeTruthy();
  expect(screen.getByLabelText("Choose recipe")).toBeTruthy();
});

it("shows connection material rates and never broadens eligibility when clearing or resetting", async () => {
  const user = userEvent.setup();
  const assets = recipeAssets();
  const allowed = new Set(["recipe:ingot", "machine:smelter"]);
  render(
    <CatalogSearch
      assets={assets}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      onAdd={vi.fn()}
      allowedEntryIds={allowed}
      connectionContext={oreConnectionContext}
    />,
  );
  expect(screen.getByText("Consumes Iron Ore")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Search mode" })).toBeNull();
  expect(screen.getByText("Consumes 30/min · Iron Ore")).toBeTruthy();
  expect(screen.queryByRole("row", { name: /Pure Iron/ })).toBeNull();
  await user.type(screen.getByRole("combobox"), "missing");
  expect(screen.getByText("No compatible choices found")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Reset search" }));
  expect(screen.getAllByRole("row")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Details for Iron Ingot" }));
  expect(
    screen.getByRole("button", { name: "Details for Pure Iron" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("places the eligible consumer after direction search using the shared placement handler", async () => {
  const user = userEvent.setup();
  const assets = recipeAssets();
  const index = createSearchIndex(assets.catalog);
  const add = vi.fn();
  render(
    <CatalogSearch
      assets={assets}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      onAdd={add}
    />,
  );
  await user.type(screen.getByRole("combobox"), "iron ore");
  await user.click(screen.getByRole("button", { name: "Consumes" }));
  await user.click(screen.getByRole("combobox"));
  await user.keyboard("{Enter}");
  expect(add).toHaveBeenCalledExactlyOnceWith(
    index.find((entry) => entry.entityId === "ingot"),
    undefined,
  );
});
