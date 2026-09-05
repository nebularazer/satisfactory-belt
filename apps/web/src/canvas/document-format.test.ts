import { describe, expect, it } from "vitest";

import {
  parseCanvasDocument,
  serializeCanvasDocument,
  validateCanvasDocument,
} from "./document-format";

const document = {
  nodes: [
    {
      configuration: {
        buildableId: "Build_ConstructorMk1_C",
        id: "node-1",
        instances: [
          {
            clockSpeedPercent: 100,
            id: "node-1:instance-1",
            somersloopCount: 0,
          },
        ],
        kind: "process" as const,
        processId: "Recipe_IronPlate_C",
      },
      height: 96,
      label: "Node 1",
      portOrder: {
        input: ["input:Desc_IngotIron_C"],
        output: ["output:Desc_IronPlate_C"],
      },
      width: 176,
      x: 0,
      y: 32,
    },
  ],
  version: 3 as const,
};

describe("canvas document format", () => {
  it("round-trips the current document version", () => {
    expect(parseCanvasDocument(serializeCanvasDocument(document))).toEqual(
      document,
    );
  });

  it("round-trips router priorities", () => {
    const priorityMerger = {
      nodes: [
        {
          configuration: {
            buildableId: "Build_ConveyorAttachmentMergerPriority_C",
            id: "priority-merger",
            kind: "router" as const,
          },
          height: 160,
          label: "Priority Merger",
          routerPriorities: {
            "input:1": "high" as const,
            "input:2": "medium" as const,
            "input:3": "low" as const,
          },
          width: 192,
          x: 0,
          y: 0,
        },
      ],
      version: 3 as const,
    };

    expect(
      parseCanvasDocument(serializeCanvasDocument(priorityMerger)),
    ).toEqual(priorityMerger);
  });

  it("rejects unknown versions without attempting migration", () => {
    expect(() => validateCanvasDocument({ ...document, version: 4 })).toThrow(
      "Unsupported document version: 4.",
    );
    expect(() => validateCanvasDocument({ ...document, version: 1 })).toThrow(
      "Unsupported document version: 1.",
    );
  });

  it("rejects malformed and duplicate nodes", () => {
    expect(() => validateCanvasDocument({ nodes: [{}], version: 3 })).toThrow(
      "invalid label",
    );
    expect(() =>
      validateCanvasDocument({
        nodes: [{ ...document.nodes[0], configuration: null }],
        version: 3,
      }),
    ).toThrow("Node configuration must be an object");
    expect(() =>
      validateCanvasDocument({
        nodes: [document.nodes[0], document.nodes[0]],
        version: 3,
      }),
    ).toThrow("Node ids must be unique.");
  });
});
