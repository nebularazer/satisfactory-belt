import { generateDetailedPlan } from "@satisfactory-belt/planning";
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

  it("round-trips validated Smart Splitter routing rules", () => {
    const document = detailedPlanToCanvasDocument(
      generateDetailedPlan({
        outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
      }).plan,
    );
    const splitter = {
      configuration: createNode({
        buildableId: "Build_ConveyorAttachmentSplitterSmart_C",
        id: "smart-splitter",
        kind: "router",
      }).configuration,
      height: 176,
      label: "Smart Splitter",
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
