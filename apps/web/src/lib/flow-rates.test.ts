import { createMachineMembers } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

it("shows known miner production and downstream allocation before exports are configured", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  expect(editor.getFlowAnalysis().status).toBe("infeasible");
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  expect(editor.getLinkRates("ore")).toEqual(["30"]);
  expect(editor.getPortFlows({ nodeId: "smelter", portKey: "input:copper" })).toEqual([
    { itemId: "copper", perMinute: 30 },
  ]);
  expect(editor.getFlowAnalysis().issues).toContainEqual(
    expect.objectContaining({ nodeId: "miner", code: "unallocated-output", perMinute: 90 }),
  );
  const labels = editor.getLinkRates("ore");
  editor.updateNodes((nodes) => nodes.map((node) => ({ ...node, x: node.x + 10 })));
  expect(editor.getLinkRates("ore")).toBe(labels);
  expect(editor.getNode("smelter")).toMatchObject({ machines: [{ clockPercent: 100 }] });
});

it("keeps material rates stable when purity, tier or clock changes and resizes from a new target", () => {
  const { assets, document } = minerFlowFixture();
  assets.catalog.extractors.mk1 = { ...assets.catalog.extractors.miner!, id: "mk1", baseRate: 60 };
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setProductionTarget("miner", "copper", 120);
  editor.setOperatingSetting("miner", "all", "purity", 2);
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  editor.setOperatingSetting("miner", "all", "clockPercent", 50);
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  editor.updateNodes((nodes) =>
    nodes.map((node) => (node.kind === "extractor" ? { ...node, extractorId: "mk1" } : node)),
  );
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  expect(editor.getLinkRates("ore")).toEqual(["120"]);
  editor.setProductionTarget("miner", "copper", null);
  editor.setProductionTarget("smelter", "iron", 150);
  expect(editor.getLinkRates("ore")).toEqual(["150"]);
  expect(editor.getPortRate("miner", "output:copper")).toBe("150");
  editor.historyCommand("undo");
  expect(editor.getLinkRates("ore")).toEqual(["120"]);
});

it("keeps each merger input's rate separate instead of repeating the whole node's incoming total", () => {
  const { assets, document, miner } = minerFlowFixture();
  assets.catalog.logistics.merge = {
    id: "merge",
    kind: "merger",
    name: "Merger",
    description: "",
    descriptorId: "merge",
    iconId: "iron",
  };
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [
      miner,
      { ...miner, id: "second", machines: createMachineMembers(1, { clockPercent: 50 }) },
      { id: "merge", kind: "logistics", partId: "merge", x: 300, y: 0 },
    ],
    links: [
      { ...document.links[0]!, input: { nodeId: "merge", portKey: "input:0" } },
      {
        id: "second",
        output: { nodeId: "second", portKey: "output:copper" },
        input: { nodeId: "merge", portKey: "input:1" },
      },
    ],
    externalFlows: [
      { port: { nodeId: "merge", portKey: "output:0" }, itemId: "copper", perMinute: 180 },
    ],
  });
  expect(editor.getPortRate("merge", "input:0")).toBe("120");
  expect(editor.getPortRate("merge", "input:1")).toBe("60");
  expect(editor.getPortRate("merge", "output:0")).toBe("180");
});

it("shows a shortage without replacing configured demand with the supplied rate", () => {
  const { assets, document, miner, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    ...document,
    nodes: [
      { ...miner, machines: createMachineMembers(1, { clockPercent: 1 }) },
      { ...smelter, machines: createMachineMembers(5) },
    ],
  });
  expect(editor.getLinkRates("ore")).toEqual(["1.2"]);
  expect(
    editor.getPortFlows({ nodeId: "smelter", portKey: "input:copper" })[0]?.perMinute,
  ).toBeCloseTo(1.2);
  expect(editor.getPortRate("smelter", "input:copper")).toBe("150");
});
