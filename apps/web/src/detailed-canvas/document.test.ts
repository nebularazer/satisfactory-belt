import { generateDetailedPlan } from "@satisfactory-belt/planning";
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
});
