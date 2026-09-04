import { describe, expect, it } from "vitest";

import {
  NodeConfigurationError,
  createNode,
  parseNodeConfiguration,
} from "./index";

describe("Nodes", () => {
  it("creates every Node family through one interface", () => {
    const processNode = createNode({
      buildableId: "Build_ConstructorMk1_C",
      id: "iron-plates",
      kind: "process",
      processId: "Recipe_IronPlate_C",
    });
    expect(processNode.configuration).toMatchObject({
      id: "iron-plates",
      kind: "process",
    });
    expect(processNode.kind === "process" && processNode.process.kind).toBe(
      "recipe",
    );

    expect(
      createNode({
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        id: "splitter",
        kind: "router",
      }).configuration,
    ).toEqual({
      buildableId: "Build_ConveyorAttachmentSplitter_C",
      id: "splitter",
      kind: "router",
    });
  });

  it("restores persisted configuration and recreates canonical defaults", () => {
    expect(
      parseNodeConfiguration({
        buildableId: "Build_ConstructorMk1_C",
        id: "iron-plates",
        instances: [{ id: "constructor-1" }],
        kind: "process",
        processId: "Recipe_IronPlate_C",
      }),
    ).toEqual({
      buildableId: "Build_ConstructorMk1_C",
      id: "iron-plates",
      instances: [
        {
          clockSpeedPercent: 100,
          id: "constructor-1",
          somersloopCount: 0,
        },
      ],
      kind: "process",
      processId: "Recipe_IronPlate_C",
    });
  });

  it("rejects structurally invalid persisted configuration", () => {
    expect(() =>
      parseNodeConfiguration({
        buildableId: "Build_ConstructorMk1_C",
        id: "iron-plates",
        instances: [],
        kind: "process",
        processId: "Recipe_IronPlate_C",
      }),
    ).toThrow(NodeConfigurationError);

    expect(() =>
      parseNodeConfiguration({
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        id: "splitter",
        kind: "transport",
        mode: "sideways",
      }),
    ).toThrow(NodeConfigurationError);
  });
});
