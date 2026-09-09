import { expect, it } from "vitest";
import { summarizeGroup, flowTotal, rateExpression } from "./group-summary";
import { modularFrameFactory } from "./modular-frame-fixture";
import { EMPTY_CANVAS_DOCUMENT } from "./document";
import { testCanvasNode } from "./test-fixtures";
import { detailedDocumentToEditor } from "./editor-mode";
import { generateProduction } from "../auto-build/generate-production";
import { convertDetailed } from "../detailed-conversion/convert";
import { productionStructure } from "./production-structure";

it("shows configured production even without outgoing belts", () => {
  const document = modularFrameFactory(false);
  const frames = document.nodes.find(
    (node) =>
      node.configuration.kind === "process" &&
      node.configuration.processId === "Recipe_ModularFrame_C",
  )!;
  const summary = summarizeGroup(document, {
    nodeIds: [frames.configuration.id],
    destinationIds: [],
  });
  expect(summary.outputs).toEqual([]);
  expect(flowTotal(summary.production[0]!.rates)).toBe(20);
  expect(summary.clocks).toHaveLength(10);
  expect(summary.power.consumed.maximumMw).toBe(150);
  expect(summary.buildings).toEqual([{ name: "Assembler", count: 10 }]);
});

it("does not turn unresolved flows into zero throughput", () => {
  const document = {
    ...EMPTY_CANVAS_DOCUMENT,
    nodes: [testCanvasNode("a"), testCanvasNode("b")],
    materialLinks: [
      {
        id: "unknown",
        from: { nodeId: "a", portId: "output:1" },
        to: { nodeId: "b", portId: "input:1" },
      },
    ],
  };
  const summary = summarizeGroup(document, {
    nodeIds: ["b"],
    destinationIds: [],
  });
  expect(flowTotal(summary.inputs[0]!.rates)).toBeUndefined();
  expect(rateExpression(summary.inputs[0]!.rates)).toBe("Unresolved");
  expect(summary.tiers).toEqual([
    { name: "Unspecified tier", incoming: 1, internal: 0, outgoing: 0 },
  ]);
});

it("counts only boundary flows as throughput and identifies remainder destinations", () => {
  const document = detailedDocumentToEditor(
    convertDetailed(
      generateProduction({
        outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
        allowedAlternateIds: [],
        pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
      }).document,
      { conveyorTierId: "conveyor-mk1", pipelineTierId: "pipeline-mk1" },
      () => {},
    ),
  );
  const structure = productionStructure(document);
  let returns = 0,
    remainders = 0;
  for (const nodeIds of structure.logistics) {
    const summary = summarizeGroup(document, {
      nodeIds,
      destinationIds: structure.logisticsDestinations.get(nodeIds[0]!)!,
    });
    const ids = new Set(nodeIds);
    expect(
      summary.incomingCount + summary.internalCount + summary.outgoingCount,
    ).toBe(
      document.materialLinks.filter(
        (link) => ids.has(link.from.nodeId) || ids.has(link.to.nodeId),
      ).length,
    );
    expect(
      summary.tiers.reduce(
        (sum, tier) => sum + tier.incoming + tier.internal + tier.outgoing,
        0,
      ),
    ).toBe(
      summary.incomingCount + summary.internalCount + summary.outgoingCount,
    );
    const inputTotal = summary.inputs.reduce(
      (sum, row) => sum + flowTotal(row.rates)!,
      0,
    );
    const outputTotal = summary.outputs.reduce(
      (sum, row) => sum + flowTotal(row.rates)!,
      0,
    );
    expect(inputTotal).toBeCloseTo(outputTotal, 4);
    returns += summary.feedbackCount;
    for (const row of summary.outputs.filter((row) => row.remainder)) {
      remainders++;
      expect(row.destination).not.toBe("");
    }
  }
  expect(returns).toBeGreaterThan(0);
  expect(remainders).toBeGreaterThan(0);
});

it("compresses equal rate runs without losing fractional rates", () => {
  expect(rateExpression([30, 30, 30, 30, 30])).toBe("5 × 30");
  expect(rateExpression([11.25, 11.25, 11.25, 11.25, 15])).toBe(
    "4 × 11.25 + 15",
  );
  expect(flowTotal([30, undefined])).toBeUndefined();
});
