import { createSearchIndex } from "@satisfactory-belt/game-data/search";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it("shows alternate prerequisites only in Details and preserves independent unlock routes", async () => {
  const user = userEvent.setup();
  const assets = recipeAssets();
  assets.catalog.recipes.alternative!.unlocks = [
    {
      id: "Alternate",
      name: "Alternate: Pure Iron",
      kind: "hard-drive",
      requirements: [
        {
          all: true,
          schematics: [
            { id: "Milestone", name: "Control System Development", kind: "milestone", tier: 7 },
            { id: "Caterium", name: "Caterium Ingots", kind: "research" },
          ],
        },
      ],
    },
    { id: "Research", name: "Iron Research", kind: "research", requirements: [] },
  ];
  render(<CatalogSearch assets={assets} open onOpenChange={vi.fn()} finalFocus={finalFocus} />);
  expect(screen.queryByRole("region", { name: "Unlock requirements" })).toBeNull();
  await user.click(await screen.findByRole("button", { name: "Details for Pure Iron" }));
  const unlocks = screen.getByRole("region", { name: "Unlock requirements" });
  expect(within(unlocks).queryByText(/Hard Drive|Requires/)).toBeNull();
  expect(within(unlocks).getByText("Tier 7 - Control System Development").tagName).toBe("LI");
  expect(within(unlocks).getByText("MAM - Caterium Ingots").tagName).toBe("LI");
  expect(within(unlocks).getByText("or")).toBeTruthy();
  expect(within(unlocks).getByText("MAM - Iron Research")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Back to results" }));
  await user.click(screen.getByRole("button", { name: "Details for Iron Ingot" }));
  expect(screen.queryByRole("region", { name: "Unlock requirements" })).toBeNull();
});

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
  expect(screen.queryByText(/Compared with/)).toBeNull();
  expect(screen.queryByText(/Iron Ore → Iron Ingot/)).toBeNull();
  expect(
    screen.getByRole("button", { name: /Machines: 0.5; less than baseline recipe/ }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Details for Pure Iron" }));
  expect(screen.queryByText(/Compared with/)).toBeNull();
  expect(screen.getByRole("button", { name: /Machines: 1; same as baseline recipe/ })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Place Smelter" }));
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0]![0]).toMatchObject({ entityId: "alternative" });
});

it("enables all search fields by default and allows independent combinations", async () => {
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
  for (const name of ["Recipe name", "Input", "Output"]) {
    expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("true");
  }
  expect(screen.queryByRole("group", { name: "Result category" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close catalog" })).toBeNull();
  await user.type(screen.getByRole("combobox"), "iron ore");
  expect(screen.getAllByRole("row")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Recipe name" }));
  expect(screen.getByRole("button", { name: "Input" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Output" }).getAttribute("aria-pressed")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Output" }));
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.getByText(/Enter Place/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Input" }));
  expect(screen.queryByRole("row")).toBeNull();
  expect(screen.getByText("Enable Recipe name, Input, or Output to search.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Reset search" }));
  for (const name of ["Recipe name", "Input", "Output"]) {
    expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("true");
  }
  await user.type(screen.getByRole("combobox"), "smelter");
  expect(screen.getByText(/Enter Choose/)).toBeTruthy();
});

it("keeps inputs, the recipe name and alternate indicator, and outputs in a single row with separate Details", async () => {
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
  const row = await screen.findByRole("row", { name: /Pure Iron/ });
  expect(within(row).getByText("Pure Iron")).toBeTruthy();
  const alternate = within(row).getByRole("img", { name: "Alternate" });
  expect(within(row).queryByText("Alternate")).toBeNull();
  await user.hover(alternate);
  // Base UI's rest delay starts with mouse movement after entering the trigger.
  fireEvent.mouseMove(alternate);
  expect(
    (await screen.findByText("Alternate")).closest('[data-slot="tooltip-content"]'),
  ).toBeTruthy();
  await user.unhover(alternate);
  const inputs = within(row).getByRole("group", { name: "Inputs" });
  const outputs = within(row).getByRole("group", { name: "Outputs" });
  expect(inputs.children).toHaveLength(4);
  expect(outputs.children).toHaveLength(4);
  expect(inputs.children[0]?.getAttribute("aria-label")).toBe("Iron Ore");
  expect(inputs.children[3]?.getAttribute("aria-hidden")).toBe("true");
  expect(outputs.children[0]?.getAttribute("aria-hidden")).toBe("true");
  expect(outputs.children[3]?.getAttribute("aria-label")).toBe("Iron Ingot");
  const cells = within(row).getAllByRole("gridcell");
  expect(cells).toHaveLength(4);
  expect(cells[0]?.contains(inputs)).toBe(true);
  expect(cells[1]?.contains(within(row).getByText("Pure Iron"))).toBe(true);
  expect(cells[1]?.contains(alternate)).toBe(true);
  expect(cells[2]?.contains(outputs)).toBe(true);
  expect(
    cells[3]?.contains(within(row).getByRole("button", { name: "Details for Pure Iron" })),
  ).toBe(true);
  expect(within(row).getByRole("button", { name: "Details for Pure Iron" }).textContent).toBe(
    "Details",
  );
  expect(row.textContent).not.toMatch(/MW|\/min|Iron Ore|Smelter/);
  await user.click(within(row).getByRole("button", { name: "Details for Pure Iron" }));
  expect(screen.getByText(/Smelter · 4 MW · 60\/min/)).toBeTruthy();
});

it("shows connection context and never broadens eligibility when clearing or resetting", async () => {
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
  expect(screen.getByRole("group", { name: "Search fields" })).toBeTruthy();
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

it("places the eligible consumer after input search using the shared placement handler", async () => {
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
  await user.click(screen.getByRole("button", { name: "Recipe name" }));
  await user.click(screen.getByRole("button", { name: "Output" }));
  await user.click(screen.getByRole("combobox"));
  await user.keyboard("{Enter}");
  expect(add).toHaveBeenCalledExactlyOnceWith(
    index.find((entry) => entry.entityId === "ingot"),
    undefined,
  );
});

it("does not substitute a packaged input when the exact material is incompatible", async () => {
  const user = userEvent.setup();
  const assets = recipeAssets();
  assets.catalog.items.packaged = {
    ...assets.catalog.items.copper!,
    id: "packaged",
    name: "Packaged Iron Ore",
  };
  assets.catalog.recipes.alternative!.ingredients = [{ itemId: "packaged", amount: 1 }];
  render(
    <CatalogSearch
      assets={assets}
      open
      onOpenChange={vi.fn()}
      finalFocus={finalFocus}
      allowedEntryIds={new Set(["recipe:alternative"])}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Recipe name" }));
  await user.click(screen.getByRole("button", { name: "Output" }));
  await user.type(screen.getByRole("combobox"), "iron ore");
  expect(screen.queryByRole("row")).toBeNull();
  await user.clear(screen.getByRole("combobox"));
  await user.type(screen.getByRole("combobox"), "packaged iron ore");
  expect(screen.getByRole("row", { name: /Pure Iron/ })).toBeTruthy();
});

it.each(["Inputs", "Outputs", "Name", "Alternate"])(
  "places a recipe once when clicking its %s area",
  async (side) => {
    const user = userEvent.setup();
    const assets = recipeAssets();
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
    const row = await screen.findByRole("row", { name: /Pure Iron/ });
    await user.click(
      side === "Alternate"
        ? within(row).getByRole("img", { name: "Alternate" })
        : side === "Name"
          ? within(row).getByText("Pure Iron")
          : within(row).getByRole("group", { name: side }),
    );
    expect(add).toHaveBeenCalledExactlyOnceWith(
      createSearchIndex(assets.catalog).find((entry) => entry.entityId === "alternative"),
      undefined,
    );
  },
);

it("opens Details from its separate action without placing the recipe", async () => {
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
  const details = await screen.findByRole("button", { name: "Details for Pure Iron" });
  await user.click(details);
  expect(screen.getByRole("button", { name: "Back to results" })).toBeTruthy();
  expect(add).not.toHaveBeenCalled();
});
