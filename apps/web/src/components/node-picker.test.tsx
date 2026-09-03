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
      screen.getByPlaceholderText("Search machines or recipes..."),
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
      machineId: "Build_AssemblerMk1_C",
      recipeId: "Recipe_IronPlateReinforced_C",
      recipeName: "Reinforced Iron Plate",
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
      screen.getByPlaceholderText("Search machines or recipes..."),
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
      screen.getByPlaceholderText("Search machines or recipes..."),
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
      machineId: "Build_ConstructorMk1_C",
      recipeId: "Recipe_Alternate_Screw_2_C",
      recipeName: "Steel Screws",
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
      machineId: "Build_ConstructorMk1_C",
      recipeId: "Recipe_IronPlate_C",
      recipeName: "Iron Plate",
    });
  });
});
