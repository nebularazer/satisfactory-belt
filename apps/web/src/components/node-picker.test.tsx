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

    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.queryByText("Machines")).not.toBeInTheDocument();
    expect(screen.queryByText("Resource extraction")).not.toBeInTheDocument();
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
      node: {
        buildableId: "Build_AssemblerMk1_C",
        kind: "process",
        processId: "Recipe_IronPlateReinforced_C",
      },
    });
  });

  it("groups production machines and resource extractors under Production", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "production" } },
    );

    expect(screen.getByLabelText("Production")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Constructor 48 recipes/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /^Miner Mk\.1.*10 recipes/ }),
    ).toBeInTheDocument();
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
    const recentOption = screen.getByRole("option", {
      name: /Cast Screws Constructor/,
    });
    expect(recentOption).toBeInTheDocument();
    expect(recentOption.parentElement).toHaveClass(
      "grid-flow-col",
      "overflow-x-auto",
    );
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
      node: {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_Alternate_Screw_2_C",
      },
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
      node: {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      },
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

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "machine" } },
    );

    const machineNames = screen
      .getAllByRole("option")
      .slice(0, 11)
      .map((option) => option.querySelector(".font-medium")?.textContent);
    expect(machineNames).toEqual([
      "Assembler",
      "Blender",
      "Constructor",
      "Converter",
      "Foundry",
      "Manufacturer",
      "Packager",
      "Particle Accelerator",
      "Quantum Encoder",
      "Refinery",
      "Smelter",
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
    fireEvent.change(search, { target: { value: "machine" } });
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

  it("shows logistics as a quick-add grid", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    const splitter = screen.getByRole("option", {
      name: "Conveyor Splitter",
    });
    expect(screen.getByText("Logistics")).toBeInTheDocument();
    expect(splitter.parentElement).toHaveClass(
      "grid",
      "grid-cols-3",
      "sm:grid-cols-5",
      "pb-4",
    );
    expect(
      Array.from(splitter.parentElement?.children ?? [])
        .slice(0, 2)
        .map((option) => option.textContent),
    ).toEqual(["Conveyor Splitter", "Conveyor Merger"]);
  });

  it("keeps pipeline junction topology out of node creation", () => {
    localStorage.setItem(
      "satisfactory-belt-recent-node-selections",
      JSON.stringify([
        {
          label: "Pipeline Junction",
          node: {
            buildableId: "Build_PipelineJunction_Cross_C",
            kind: "router",
          },
        },
      ]),
    );
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    expect(screen.queryByText("Pipeline Junction")).not.toBeInTheDocument();
    expect(screen.queryByText("Pipeline T-Junction")).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "pipeline junction" } },
    );
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("navigates quick-add tiles with the keyboard", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    const search = screen.getByPlaceholderText(
      "Search buildings or recipes...",
    );
    expect(search).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("Build_ConveyorAttachmentSplitter_C"),
    );

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({
      label: "Conveyor Merger",
      node: {
        buildableId: "Build_ConveyorAttachmentMerger_C",
        kind: "router",
      },
    });
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
      node: {
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        kind: "router",
      },
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
      ["water", ["Resource Well Pressurizer", "Water Extractor"]],
      ["crude oil", ["Oil Extractor", "Resource Well Pressurizer"]],
      ["nitrogen gas", ["Resource Well Pressurizer"]],
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
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
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
      node: {
        buildableId: "Build_WaterPump_C",
        kind: "process",
        processId: "extraction:Desc_Water_C",
      },
    });
  });

  it("places buffers directly", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "storage container" } },
    );
    fireEvent.click(screen.getByRole("option", { name: "Storage Container" }));

    expect(onSelect).toHaveBeenCalledWith({
      label: "Storage Container",
      node: {
        buildableId: "Build_StorageContainerMk1_C",
        kind: "buffer",
      },
    });
  });

  it("selects a Power Generator process", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "coal-powered generator" } },
    );
    fireEvent.click(
      screen.getByRole("option", { name: "Coal-Powered Generator" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "Coal-Powered Generator: Coal" }),
    );

    expect(onSelect).toHaveBeenCalledWith({
      label: "Coal-Powered Generator: Coal",
      node: {
        buildableId: "Build_GeneratorCoal_C",
        kind: "process",
        processId: "power-generation:Build_GeneratorCoal_C:Desc_Coal_C",
      },
    });
  });

  it("selects a Resource Well process through its Pressurizer", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "resource well pressurizer" } },
    );
    fireEvent.click(
      screen.getByRole("option", {
        name: /^Resource Well Pressurizer.*3 recipes$/,
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Nitrogen Gas" }));

    expect(onSelect).toHaveBeenCalledWith({
      label: "Nitrogen Gas",
      node: {
        buildableId: "Build_FrackingSmasher_C",
        kind: "process",
        processId: "resource-well:Desc_NitrogenGas_C",
      },
    });
  });

  it("selects the operating mode for a Transport", () => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: "truck station" } },
    );
    fireEvent.click(screen.getByRole("option", { name: "Truck Station" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Truck Station (Unload)" }),
    );

    expect(onSelect).toHaveBeenCalledWith({
      label: "Truck Station (Unload)",
      node: {
        buildableId: "Build_TruckStation_C",
        kind: "transport",
        mode: "unload",
      },
    });
  });
});
