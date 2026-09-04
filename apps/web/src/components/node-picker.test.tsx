import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { NodePicker } from "./node-picker";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("NodePicker", () => {
  it("keeps recipes out of the initial building browser", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    expect(screen.getByText("Machines")).toBeInTheDocument();
    expect(screen.queryByText("Recipes")).not.toBeInTheDocument();
    expect(
      screen.getByRole("listbox", { name: "Buildings and recipes" }),
    ).toHaveClass(
      "min-h-[clamp(10rem,45dvh,20rem)]",
      "sm:min-h-[min(32rem,calc(100dvh-12rem))]",
    );
  });

  it("finds and selects a machine by recipe", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "reinforced iron plate" } },
    );
    expect(
      screen.queryByRole("option", { name: /Quartz Purification/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("option", {
        name: /^Reinforced Iron Plate.*Iron Plate.*Assembler/,
      }),
    );

    expect(onSelect).toHaveBeenCalledWith({
      label: "Reinforced Iron Plate",
      machineId: "Build_AssemblerMk1_C",
      recipeId: "Recipe_IronPlateReinforced_C",
    });
  });

  it("shows normalized alternate recipes with production details", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "cast screws" } },
    );

    const recipe = screen.getByRole("option", { name: /^Cast Screws/ });
    expect(within(recipe).getByText("Cast Screws")).toBeInTheDocument();
    expect(within(recipe).getByText("Alternate")).toBeInTheDocument();
    expect(
      screen.queryByText("Alternate: Cast Screws"),
    ).not.toBeInTheDocument();
    expect(within(recipe).getByText("IN")).toHaveAccessibleName("Inputs");
    expect(within(recipe).getByText("12.5/min")).toBeInTheDocument();
    expect(within(recipe).getByText("Iron Ingot")).toBeInTheDocument();
    expect(within(recipe).getByText("OUT")).toHaveAccessibleName("Outputs");
    expect(within(recipe).getByText("50/min")).toBeInTheDocument();
    expect(within(recipe).getByText("Screws")).toBeInTheDocument();
    expect(within(recipe).getByText("Constructor · 4 MW")).toBeInTheDocument();
    expect(within(recipe).queryByText(/^(?:→|\+)$/)).not.toBeInTheDocument();
  });

  it("highlights the visible text that caused a recipe result", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "sink" } },
    );

    const directMatch = screen.getByRole("option", {
      name: /^AWESOME Sink/,
    });
    expect(
      within(directMatch).getByText("Sink", { selector: "mark" }),
    ).toBeInTheDocument();

    const materialMatch = screen.getByRole("option", {
      name: /^Cooling Device/,
    });
    expect(
      within(materialMatch).getByText("Sink", { selector: "mark" }),
    ).toBeInTheDocument();
  });

  it("de-emphasizes recipe materials that did not cause the match", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "heat sink" } },
    );

    const recipe = screen.getByRole("option", { name: /^Cooling Device/ });
    expect(within(recipe).getByText("Heat Sink")).not.toHaveClass("opacity-45");
    expect(within(recipe).getByText("Motor")).toHaveClass("opacity-45");
  });

  it("remembers recent selections for the next picker", () => {
    const firstPicker = render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );
    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "cast screws" } },
    );
    fireEvent.click(screen.getByRole("option", { name: /^Cast Screws/ }));
    firstPicker.unmount();

    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    expect(screen.getByText("Recently used")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Cast Screws Constructor/ }),
    ).toBeInTheDocument();
  });

  it("explains matches found through extractor resource metadata", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "iron ore" } },
    );

    const miner = screen.getByRole("option", { name: /^Miner Mk\.1/ });
    expect(within(miner).getByText("Matches resource:")).toBeInTheDocument();
    expect(
      within(miner).getByText("Iron Ore", { selector: "mark" }),
    ).toBeInTheDocument();
  });

  it("shows every recipe material without collapsing complex recipes", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "adaptive control unit" } },
    );

    const recipe = screen.getByRole("option", {
      name: /^Adaptive Control Unit/,
    });
    expect(within(recipe).getByText("Automated Wiring")).toBeInTheDocument();
    expect(within(recipe).getByText("Circuit Board")).toBeInTheDocument();
    expect(within(recipe).getByText("Heavy Modular Frame")).toBeInTheDocument();
    expect(within(recipe).getByText("Computer")).toBeInTheDocument();
    expect(within(recipe).getAllByText("Adaptive Control Unit")).toHaveLength(
      2,
    );
    expect(screen.queryByText("4 inputs")).not.toBeInTheDocument();
  });

  it("opens production routes without selecting the recipe", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "screws" } },
    );
    expect(screen.getAllByRole("option")[0]).toHaveAccessibleName(/^Screws/);
    expect(screen.queryByText("3 ways")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Show Screws recipes",
      })[0],
    );

    expect(onSelect).not.toHaveBeenCalled();
    const heading = screen.getByText("Screws Recipes");
    expect(heading).toBeInTheDocument();
    expect(
      heading.parentElement?.parentElement?.querySelector("img"),
    ).toHaveAttribute("src", "/items/Desc_IronScrew_C.png");
    expect(
      screen.getByPlaceholderText("Search Screws recipes..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getAllByText("Alternate")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to previous recipe results",
      }),
    );
    expect(screen.getByDisplayValue("screws")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Show Screws recipes",
      })[0],
    );

    fireEvent.click(
      screen.getByRole("option", { name: /^Steel ScrewsAlternate/ }),
    );
    expect(onSelect).toHaveBeenCalledWith({
      label: "Steel Screws",
      machineId: "Build_ConstructorMk1_C",
      recipeId: "Recipe_Alternate_Screw_2_C",
    });
  });

  it("narrows recipes after selecting a machine", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.click(
      screen.getByRole("option", { name: /Constructor 48 recipes/ }),
    );
    expect(
      screen.getByPlaceholderText("Search Constructor recipes..."),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText("Search Constructor recipes..."),
      { target: { value: "iron plate" } },
    );
    fireEvent.click(
      screen.getByRole("option", { name: /Iron Plate.*Constructor/ }),
    );

    expect(onSelect).toHaveBeenCalledWith({
      label: "Iron Plate",
      machineId: "Build_ConstructorMk1_C",
      recipeId: "Recipe_IronPlate_C",
    });
  }, 10_000);

  it("sorts machines alphabetically", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    const machineNames = screen
      .getAllByRole("option")
      .slice(0, 11)
      .map((option) => option.textContent);
    expect(machineNames).toEqual([
      "Assembler66 recipes",
      "Blender17 recipes",
      "Constructor48 recipes",
      "Converter25 recipes",
      "Foundry16 recipes",
      "Manufacturer37 recipes",
      "Packager24 recipes",
      "Particle Accelerator12 recipes",
      "Quantum Encoder6 recipes",
      "Refinery34 recipes",
      "Smelter6 recipes",
    ]);
  });

  it("navigates and selects virtualized results with the keyboard", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    const search = screen.getByPlaceholderText(
      "Search buildings or recipes...",
    );
    expect(search).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("machine-Build_AssemblerMk1_C"),
    );

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(search).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("machine-Build_Blender_C"),
    );

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(
      screen.getByPlaceholderText("Search Constructor recipes..."),
    ).toBeInTheDocument();
  });

  it("places infrastructure buildables directly", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "conveyor splitter" } },
    );
    fireEvent.click(screen.getByRole("option", { name: "Conveyor Splitter" }));

    expect(onSelect).toHaveBeenCalledWith({
      label: "Conveyor Splitter",
      machineId: "Build_ConveyorAttachmentSplitter_C",
    });
  }, 10_000);

  it("finds extractors by the resources they produce", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    const cases = [
      ["iron ore", ["Miner Mk.1", "Miner Mk.2", "Miner Mk.3"]],
      ["water", ["Resource Well Extractor", "Water Extractor"]],
      ["crude oil", ["Oil Extractor", "Resource Well Extractor"]],
      ["nitrogen gas", ["Resource Well Extractor"]],
    ] as const;

    for (const [query, extractorNames] of cases) {
      fireEvent.change(
        screen.getByPlaceholderText("Search buildings or recipes..."),
        { target: { value: query } },
      );

      for (const name of extractorNames) {
        expect(
          screen
            .getAllByRole("option")
            .some((option) => option.textContent?.startsWith(name)),
        ).toBe(true);
      }
    }
  }, 15_000);

  it("opens multi-resource extractor recipes and selects a resource", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    const search = screen.getByPlaceholderText(
      "Search buildings or recipes...",
    );
    fireEvent.change(search, { target: { value: "miner mk.1" } });
    fireEvent.click(
      screen.getByRole("option", { name: /^Miner Mk\.1.*10 recipes$/ }),
    );

    expect(
      screen.getByPlaceholderText("Search Miner Mk.1 recipes..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Miner Mk.1")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bauxite" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Copper Ore" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Iron Ore" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Iron Ore" }));
    expect(onSelect).toHaveBeenCalledWith({
      label: "Iron Ore",
      machineId: "Build_MinerMk1_C",
    });
  });

  it("places a single-resource extractor directly", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "water extractor" } },
    );
    fireEvent.click(
      screen.getByRole("option", { name: /^Water Extractor.*1 recipe$/ }),
    );

    expect(onSelect).toHaveBeenCalledWith({
      label: "Water",
      machineId: "Build_WaterPump_C",
    });
  });
});
