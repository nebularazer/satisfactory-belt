import {
  assertDetailedNodeConfiguration,
  generateDetailedPlan,
} from "@satisfactory-belt/planning";
import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import { detailedPlanToCanvasDocument } from "@/canvas/plan-adapters";

import {
  serializeDetailedCanvasDocument,
  validateDetailedCanvasDocument,
} from "./document";

describe("Detailed canvas documents", () => {
  it("round-trips independently from Basic documents", () => {
    const document = detailedPlanToCanvasDocument(
      generateDetailedPlan({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
      }).plan,
    );
    expect(
      validateDetailedCanvasDocument(
        JSON.parse(serializeDetailedCanvasDocument(document)),
      ),
    ).toEqual(document);
  });

  it("rejects another Plan Kind", () => {
    expect(() =>
      validateDetailedCanvasDocument({
        kind: "basic",
        materialLinks: [],
        nodes: [],
        version: 4,
      }),
    ).toThrow("Detailed");
  });

  it("rejects an aggregate process Node during import", () => {
    const document = detailedPlanToCanvasDocument(
      generateDetailedPlan({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
      }).plan,
    );
    const processNode = document.nodes.find(
      ({ configuration }) => configuration.kind === "process",
    );
    if (!processNode || processNode.configuration.kind !== "process") {
      throw new Error("Expected a generated process Node.");
    }
    const instance = processNode.configuration.instances[0]!;

    expect(() =>
      validateDetailedCanvasDocument({
        ...document,
        nodes: document.nodes.map((node) =>
          node === processNode
            ? {
                ...node,
                configuration: {
                  ...node.configuration,
                  instances: [instance, { ...instance, id: "second-instance" }],
                },
              }
            : node,
        ),
      }),
    ).toThrow("exactly one Buildable instance");
  });

  it("round-trips validated Smart Splitter routing rules", () => {
    const document = detailedPlanToCanvasDocument(
      generateDetailedPlan({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
      }).plan,
    );
    const configuration = createNode({
      buildableId: "Build_ConveyorAttachmentSplitterSmart_C",
      id: "smart-splitter",
      kind: "router",
    }).configuration;
    assertDetailedNodeConfiguration(configuration);
    const splitter = {
      configuration,
      height: 176,
      label: "Smart Splitter",
      portOrder: { output: ["output:3", "output:1", "output:2"] },
      routerPriorities: { "output:1": "high" as const },
      routerRules: { "output:1": ["Desc_IronIngot_C"] },
      routingRules: [
        {
          itemIds: ["Desc_IronIngot_C"],
          outputPortId: "output:1",
        },
      ],
      width: 192,
      x: 0,
      y: 0,
    } as const;
    const withRouting = {
      ...document,
      nodes: [...document.nodes, splitter],
    };

    expect(
      validateDetailedCanvasDocument(
        JSON.parse(serializeDetailedCanvasDocument(withRouting)),
      ),
    ).toEqual(withRouting);
  });

  it("rejects malformed routing rules during import", () => {
    const document = detailedPlanToCanvasDocument(
      generateDetailedPlan({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
      }).plan,
    );
    expect(() =>
      validateDetailedCanvasDocument({
        ...document,
        nodes: [
          {
            ...document.nodes[0],
            routingRules: [{ itemIds: "not-an-array", outputPortId: "x" }],
          },
        ],
      }),
    ).toThrow("routing rule");
  });
});
