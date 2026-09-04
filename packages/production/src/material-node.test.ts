import { describe, expect, it } from "vitest";

import {
  MaterialNodeConfigurationError,
  createMaterialNode,
  findBuffer,
} from "./index";

describe("material nodes", () => {
  it("creates a Conveyor Splitter with one input and three outputs", () => {
    const node = createMaterialNode({
      buildableId: "Build_ConveyorAttachmentSplitter_C",
      id: "splitter",
      itemId: "Desc_IronPlate_C",
      kind: "router",
    });

    expect(node.ports).toHaveLength(4);
    expect(
      node.ports.filter(({ direction }) => direction === "input"),
    ).toHaveLength(1);
    expect(
      node.ports.filter(({ direction }) => direction === "output"),
    ).toHaveLength(3);
    expect(
      node.ports.every(({ itemId }) => itemId === "Desc_IronPlate_C"),
    ).toBe(true);
    expect(node.profile.inputs).toEqual([]);
    expect(node.profile.outputs).toEqual([]);
  });

  it("keeps Pipeline Junction ports bidirectional", () => {
    const node = createMaterialNode({
      buildableId: "Build_PipelineJunction_Cross_C",
      id: "junction",
      itemId: "Desc_Water_C",
      kind: "router",
    });

    expect(node.ports).toHaveLength(4);
    expect(
      node.ports.every(
        ({ direction, medium }) =>
          direction === "bidirectional" && medium === "pipeline",
      ),
    ).toBe(true);
  });

  it("exposes Buffer capacity without resolving flow", () => {
    expect(findBuffer("Build_StorageContainerMk2_C")?.capacity).toEqual({
      slots: 48,
      type: "inventory",
    });

    const node = createMaterialNode({
      buildableId: "Build_IndustrialTank_C",
      id: "water-buffer",
      itemId: "Desc_Water_C",
      kind: "buffer",
    });
    expect(node.ports).toEqual([
      {
        direction: "bidirectional",
        forms: ["liquid", "gas"],
        id: "port:1",
        itemId: "Desc_Water_C",
        medium: "pipeline",
      },
      {
        direction: "bidirectional",
        forms: ["liquid", "gas"],
        id: "port:2",
        itemId: "Desc_Water_C",
        medium: "pipeline",
      },
    ]);
  });

  it("orients Transport ports from the configured mode", () => {
    const node = createMaterialNode({
      buildableId: "Build_TruckStation_C",
      id: "truck-loader",
      itemId: "Desc_Coal_C",
      kind: "transport",
      mode: "load",
    });

    expect(node.ports).toEqual([
      {
        direction: "input",
        forms: ["solid"],
        id: "cargo:input:1",
        itemId: "Desc_Coal_C",
        medium: "conveyor",
      },
      {
        direction: "input",
        forms: ["solid"],
        id: "cargo:input:2",
        itemId: "Desc_Coal_C",
        medium: "conveyor",
      },
      {
        direction: "output",
        forms: ["solid"],
        id: "cargo:remote",
        itemId: "Desc_Coal_C",
        medium: "vehicle",
      },
      {
        direction: "input",
        forms: ["solid"],
        id: "fuel:input",
        medium: "conveyor",
        purpose: "fuel",
      },
    ]);
    expect(node.profile.power.consumed).toEqual({
      maximumMw: 20,
      minimumMw: 20,
    });
  });

  it("rejects material forms a Buildable cannot carry", () => {
    expect(() =>
      createMaterialNode({
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        id: "wet-splitter",
        itemId: "Desc_Water_C",
        kind: "router",
      }),
    ).toThrow(MaterialNodeConfigurationError);
  });
});
