import { describe, expect, it } from "vitest";

import type { CanvasNode } from "./document";
import { createNodeCardModel } from "./node-card-model";

function nitroRocketFuelNode(): CanvasNode {
  return {
    configuration: {
      buildableId: "Build_Blender_C",
      id: "nitro-rocket-fuel",
      instances: [
        {
          clockSpeedPercent: 100,
          id: "blender-1",
          somersloopCount: 0,
        },
        {
          clockSpeedPercent: 50,
          id: "blender-2",
          somersloopCount: 0,
        },
      ],
      kind: "process",
      processId: "Recipe_Alternate_RocketFuel_Nitro_C",
    },
    height: 256,
    label: "Nitro Rocket Fuel",
    width: 256,
    x: 0,
    y: 0,
  };
}

describe("node card model", () => {
  it("projects a process into the locked card content", () => {
    const model = createNodeCardModel(nitroRocketFuelNode());

    expect(model).toMatchObject({
      clock: "75%",
      efficiency: { percent: "—", status: "neutral" },
      power: "105 MW",
      subtitle: "2× Blender",
      title: "Nitro Rocket Fuel",
    });
    expect(model.leftPorts.map(({ rate }) => rate)).toEqual([
      "150",
      "112.5",
      "150",
      "75",
    ]);
    expect(model.rightPorts.map(({ rate }) => rate)).toEqual(["225", "37.5"]);
    expect(model.leftPorts.every(({ connected }) => !connected)).toBe(true);
  });

  it("uses the user-defined material port order", () => {
    const node = nitroRocketFuelNode();
    const original = createNodeCardModel(node).leftPorts.map(
      ({ portId }) => portId,
    );
    const model = createNodeCardModel({
      ...node,
      portOrder: { input: original.toReversed() },
    });

    expect(model.leftPorts.map(({ portId }) => portId)).toEqual(
      original.toReversed(),
    );
  });

  it("shows a configured smart splitter material on its output", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_ConveyorAttachmentSplitterSmart_C",
        id: "smart-splitter",
        kind: "router",
      },
      height: 160,
      label: "Smart Splitter",
      routerRules: { "output:1": ["Desc_OreIron_C"] },
      width: 192,
      x: 0,
      y: 0,
    });

    expect(model.rightPorts[0]).toMatchObject({ itemName: "Iron Ore" });
  });

  it("shows a rule count instead of one material for a multi-rule output", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_ConveyorAttachmentSplitterProgrammable_C",
        id: "programmable-splitter",
        kind: "router",
      },
      height: 160,
      label: "Programmable Splitter",
      routerRules: {
        "output:1": ["Desc_OreIron_C", "Desc_OreCopper_C", "overflow"],
      },
      width: 192,
      x: 0,
      y: 0,
    });

    expect(model.rightPorts[0]).toMatchObject({
      itemName: "3 routing rules",
      ruleCount: 3,
    });
    expect(model.rightPorts[0]?.image).toBeUndefined();
  });

  it("applies connection, port status, and efficiency runtime state", () => {
    const model = createNodeCardModel(nitroRocketFuelNode(), {
      efficiency: { percent: 68, status: "warning" },
      ports: {
        "input:Desc_NitrogenGas_C": {
          connected: true,
          status: "warning",
        },
      },
    });

    expect(model.efficiency).toEqual({ percent: "68%", status: "warning" });
    expect(model.leftPorts[1]).toMatchObject({
      connected: true,
      itemName: "Nitrogen Gas",
      status: "warning",
    });
  });

  it("always shows a nominal clock", () => {
    const node = nitroRocketFuelNode();
    if (node.configuration.kind !== "process") {
      throw new Error("Expected a process node");
    }
    const model = createNodeCardModel({
      ...node,
      configuration: {
        ...node.configuration,
        instances: [
          {
            clockSpeedPercent: 100,
            id: "blender-1",
            somersloopCount: 0,
          },
        ],
      },
    });

    expect(model.clock).toBe("100%");
  });

  it("hides generated power", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_GeneratorCoal_C",
        id: "coal-generator-1",
        instances: [
          {
            clockSpeedPercent: 100,
            id: "coal-generator-instance-1",
          },
        ],
        kind: "process",
        processId: "power-generation:Build_GeneratorCoal_C:Desc_Coal_C",
      },
      height: 256,
      label: "Coal-Powered Generator: Coal",
      width: 256,
      x: 0,
      y: 0,
    });

    expect(model.power).toBeUndefined();
  });

  it("omits clock for a non-clockable process without inventing efficiency", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_ResourceSink_C",
        id: "sink-1",
        instances: [{ id: "sink-instance-1" }],
        kind: "process",
        processId: "consumption:Build_ResourceSink_C",
      },
      height: 256,
      label: "AWESOME Sink",
      width: 256,
      x: 0,
      y: 0,
    });

    expect(model.clock).toBeUndefined();
    expect(model.efficiency).toEqual({ percent: "—", status: "neutral" });
    expect(model.power).toBe("30 MW");
  });

  it("keeps every physical splitter port and hides inapplicable metrics", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        id: "splitter-1",
        kind: "router",
      },
      height: 256,
      label: "Conveyor Splitter",
      width: 256,
      x: 0,
      y: 0,
    });

    expect(model).toMatchObject({
      leftPorts: [{ direction: "input" }],
      rightPorts: [
        { direction: "output" },
        { direction: "output" },
        { direction: "output" },
      ],
      title: "Splitter",
    });
    expect(model.subtitle).toBeUndefined();
    expect(model.clock).toBeUndefined();
    expect(model.efficiency).toBeUndefined();
    expect(model.power).toBeUndefined();
    expect(model.rightPorts.every(({ rate }) => rate === undefined)).toBe(true);
  });

  it.each([
    ["Build_ConveyorAttachmentSplitter_C", "Conveyor Splitter", "Splitter"],
    ["Build_ConveyorAttachmentMerger_C", "Conveyor Merger", "Merger"],
  ] as const)(
    "shortens the %s router title",
    (buildableId, label, expectedTitle) => {
      const model = createNodeCardModel({
        configuration: {
          buildableId,
          id: `router-${expectedTitle.toLowerCase()}`,
          kind: "router",
        },
        height: 160,
        label,
        width: 192,
        x: 0,
        y: 0,
      });

      expect(model.title).toBe(expectedTitle);
    },
  );

  it("shows the truck station mode only in the subtitle", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_TruckStation_C",
        id: "truck-station-unload",
        kind: "transport",
        mode: "unload",
      },
      height: 256,
      label: "Truck Station (Unload)",
      width: 256,
      x: 0,
      y: 0,
    });

    expect(model.title).toBe("Truck Station");
    expect(model.subtitle).toBe("Unload");
  });

  it("keeps unresolved junction ports bidirectional", () => {
    const model = createNodeCardModel({
      configuration: {
        buildableId: "Build_PipelineJunction_T_C",
        id: "junction-1",
        kind: "router",
      },
      height: 256,
      label: "Pipeline T-Junction",
      width: 256,
      x: 0,
      y: 0,
    });

    expect(model.leftPorts).toHaveLength(2);
    expect(model.rightPorts).toHaveLength(1);
    expect(
      [...model.leftPorts, ...model.rightPorts].every(
        ({ direction }) => direction === "bidirectional",
      ),
    ).toBe(true);
  });

  it("uses runtime flow direction for a bidirectional port", () => {
    const model = createNodeCardModel(
      {
        configuration: {
          buildableId: "Build_PipeStorageTank_C",
          id: "buffer-1",
          kind: "buffer",
        },
        height: 256,
        label: "Fluid Buffer",
        width: 256,
        x: 0,
        y: 0,
      },
      {
        ports: {
          "port:1": { connected: true, direction: "input" },
          "port:2": { connected: true, direction: "output" },
        },
      },
    );

    expect(model.leftPorts[0]?.direction).toBe("input");
    expect(model.rightPorts[0]?.direction).toBe("output");
    expect(model.subtitle).toBe("400 m³");
  });
});
