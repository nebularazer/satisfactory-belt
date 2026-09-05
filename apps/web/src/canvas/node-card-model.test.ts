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
      title: "Conveyor Splitter",
    });
    expect(model.subtitle).toBeUndefined();
    expect(model.clock).toBeUndefined();
    expect(model.efficiency).toBeUndefined();
    expect(model.power).toBeUndefined();
    expect(model.rightPorts.every(({ rate }) => rate === undefined)).toBe(true);
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
