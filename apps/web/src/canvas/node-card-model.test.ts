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
      efficiency: { percent: "100%", status: "neutral" },
      power: "105 MW",
      subtitle: "2× Blender",
      title: "Nitro Rocket Fuel",
    });
    expect(model.inputs.map(({ rate }) => rate)).toEqual([
      "150",
      "112.5",
      "150",
      "75",
    ]);
    expect(model.outputs.map(({ rate }) => rate)).toEqual(["225", "37.5"]);
    expect(model.inputs.every(({ connected }) => !connected)).toBe(true);
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
    expect(model.inputs[1]).toMatchObject({
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
});
