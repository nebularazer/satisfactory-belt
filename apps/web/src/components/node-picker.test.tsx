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

describe("NodePicker", () => {
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
        name: "Show 3 ways to produce Screws",
      })[0],
    );

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("Ways to produce Screws")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search ways to produce Screws..."),
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
        name: "Show 3 ways to produce Screws",
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
  });

  it("sorts machines alphabetically", () => {
    render(
      <NodePicker
        onOpenChange={() => undefined}
        onSelect={() => undefined}
        open
      />,
    );

    const machineNames = screen
      .getByRole("group", { name: "Machines" })
      .querySelectorAll('[role="option"]');
    expect([...machineNames].map((option) => option.textContent)).toEqual([
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
        expect(screen.getByRole("option", { name })).toBeInTheDocument();
      }
    }
  }, 15_000);
});
