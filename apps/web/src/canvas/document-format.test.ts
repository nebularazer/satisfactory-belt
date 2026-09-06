import { describe, expect, it } from "vitest";

import {
  parseCanvasDocument,
  serializeCanvasDocument,
  validateCanvasDocument,
} from "./document-format";

const document = {
  kind: "basic" as const,
  materialLinks: [],
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
  version: 4 as const,
};

describe("canvas document format", () => {
  it("round-trips the current document version", () => {
    expect(parseCanvasDocument(serializeCanvasDocument(document))).toEqual(
      document,
    );
  });

  it("round-trips router priorities", () => {
    const priorityMerger = {
      kind: "basic" as const,
      materialLinks: [],
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
      version: 4 as const,
    };

    expect(
      parseCanvasDocument(serializeCanvasDocument(priorityMerger)),
    ).toEqual(priorityMerger);
  });

  it("round-trips Material Links and validates their endpoints", () => {
    const linked = {
      kind: "basic" as const,
      materialLinks: [
        {
          from: {
            nodeId: "miner",
            portId: "output:Desc_OreIron_C",
          },
          id: "ore-link",
          to: {
            nodeId: "smelter",
            portId: "input:Desc_OreIron_C",
          },
        },
      ],
      nodes: [
        {
          configuration: {
            buildableId: "Build_MinerMk1_C",
            id: "miner",
            instances: [
              {
                clockSpeedPercent: 100,
                id: "miner:instance-1",
                resourcePurity: "normal" as const,
              },
            ],
            kind: "process" as const,
            processId: "extraction:Desc_OreIron_C",
          },
          height: 176,
          label: "Miner",
          width: 192,
          x: 0,
          y: 0,
        },
        {
          ...document.nodes[0]!,
          configuration: {
            buildableId: "Build_SmelterMk1_C",
            id: "smelter",
            instances: [
              {
                clockSpeedPercent: 100,
                id: "smelter:instance-1",
                somersloopCount: 0,
              },
            ],
            kind: "process" as const,
            processId: "Recipe_IngotIron_C",
          },
        },
      ],
      version: 4 as const,
    };
    expect(parseCanvasDocument(serializeCanvasDocument(linked))).toEqual(
      linked,
    );
    expect(() =>
      validateCanvasDocument({
        ...linked,
        materialLinks: [
          {
            ...linked.materialLinks[0],
            to: { nodeId: "missing", portId: "input:ore" },
          },
        ],
      }),
    ).toThrow("does not exist");
  });

  it("migrates version 3 documents with an empty Material Link collection", () => {
    const { kind: _kind, materialLinks: _materialLinks, ...legacy } = document;
    expect(validateCanvasDocument({ ...legacy, version: 3 })).toEqual(document);
  });

  it("rejects unknown versions without attempting migration", () => {
    expect(() => validateCanvasDocument({ ...document, version: 5 })).toThrow(
      "Unsupported document version: 5.",
    );
    expect(() => validateCanvasDocument({ ...document, version: 1 })).toThrow(
      "Unsupported document version: 1.",
    );
  });

  it("rejects malformed and duplicate nodes", () => {
    expect(() => validateCanvasDocument({ nodes: [{}], version: 4 })).toThrow(
      "invalid label",
    );
    expect(() =>
      validateCanvasDocument({
        nodes: [{ ...document.nodes[0], configuration: null }],
        version: 4,
      }),
    ).toThrow("Node configuration must be an object");
    expect(() =>
      validateCanvasDocument({
        nodes: [document.nodes[0], document.nodes[0]],
        version: 4,
      }),
    ).toThrow("Node ids must be unique.");
  });
});
