import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
        name: /^Reinforced Iron Plate Iron Plate.*Assembler/,
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

    expect(screen.getByText("Cast Screws")).toBeInTheDocument();
    expect(screen.getByText("Alternate")).toBeInTheDocument();
    expect(
      screen.queryByText("Alternate: Cast Screws"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Iron Ingot 12.5/min")).toBeInTheDocument();
    expect(screen.getByText("→ Screws 50/min")).toBeInTheDocument();
    expect(screen.getByText("Constructor · 4 MW")).toBeInTheDocument();
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

  it.each([
    ["miner mk.1", "Miner Mk.1", "Build_MinerMk1_C"],
    [
      "conveyor splitter",
      "Conveyor Splitter",
      "Build_ConveyorAttachmentSplitter_C",
    ],
    ["awesome sink", "AWESOME Sink", "Build_ResourceSink_C"],
  ])("places the %s buildable directly", (query, label, machineId) => {
    const onSelect = vi.fn();
    render(
      <NodePicker onOpenChange={() => undefined} onSelect={onSelect} open />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Search buildings or recipes..."),
      { target: { value: query } },
    );
    fireEvent.click(screen.getByRole("option", { name: label }));

    expect(onSelect).toHaveBeenCalledWith({ label, machineId });
  });
});
