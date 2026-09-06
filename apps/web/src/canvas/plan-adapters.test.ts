import {
  generateBasicPlan,
  generateDetailedPlan,
} from "@satisfactory-belt/planning";
import { describe, expect, it } from "vitest";

import { createDetailedCanvasEditor } from "@/detailed-canvas/editor";

import { createCanvasEditor } from "./editor";
import {
  basicPlanToCanvasDocument,
  detailedPlanToCanvasDocument,
} from "./plan-adapters";

const request = {
  outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
} as const;

describe("generated Plan canvas adapters", () => {
  it("opens a generated Basic Plan in the Basic editor", () => {
    const editor = createCanvasEditor({
      document: basicPlanToCanvasDocument(generateBasicPlan(request).plan),
    });
    expect(editor.getState().document.materialLinks.length).toBeGreaterThan(0);
  });

  it("opens a generated Detailed Plan only in the Detailed editor", () => {
    const document = detailedPlanToCanvasDocument(
      generateDetailedPlan(request).plan,
    );
    expect(createDetailedCanvasEditor(document).getState().document.kind).toBe(
      "detailed",
    );
  });
});
