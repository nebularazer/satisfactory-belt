/* oxlint-disable oxc/no-map-spread -- Test fixtures keep their source documents immutable. */
import { createMachineMembers } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

it("shows known miner production and downstream allocation before exports are configured", () => {
  const { assets, document: initial } = minerFlowFixture();
  const document = {
    ...initial,
    nodes: initial.nodes.map((node) => ({
      ...node,
      flow: {
        targets: {
          [node.kind === "extractor" ? "copper" : "iron"]: node.kind === "extractor" ? 120 : 30,
        },
      },
    })),
  };
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
  editor.setAutomaticSizing("miner", true);
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

it("keeps an unmet target while showing the actual supplied rate", () => {
  const { assets, document, miner, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    ...document,
    nodes: [
      {
        ...miner,
        machines: createMachineMembers(1, { clockPercent: 1 }),
        flow: { targets: { copper: 1.2 } },
      },
      { ...smelter, machines: createMachineMembers(5), flow: { targets: { iron: 150 } } },
    ],
  });
  expect(editor.getLinkRates("ore")).toEqual(["1.2"]);
  expect(
    editor.getPortFlows({ nodeId: "smelter", portKey: "input:copper" })[0]?.perMinute,
  ).toBeCloseTo(1.2);
  expect(editor.getPortRate("smelter", "input:copper")).toBe("1.2");
  expect(editor.getNode("smelter")).toMatchObject({ flow: { targets: { iron: 150 } } });
});

it("respects individual maximum clocks by adding machines instead of exceeding ceilings", () => {
  const { assets, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [{ ...smelter, flow: { targets: { iron: 150 } } }],
    links: [],
  });
  const before = editor.getNode(smelter.id);
  if (before?.kind !== "manufacturing") throw new Error("Expected smelter");
  const memberId = before.machines[0]!.id;
  editor.setOperatingSetting(smelter.id, memberId, "clockPercent", 50);
  const after = editor.getNode(smelter.id);
  if (after?.kind !== "manufacturing") throw new Error("Expected smelter");
  expect(after.machines).toHaveLength(6);
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  for (const member of after.machines)
    expect(member.clockPercent).toBeLessThanOrEqual(member.id === memberId ? 50 : 100);
  editor.historyCommand("undo");
  expect(editor.getNode(smelter.id)).toEqual(before);
});

it("changes unlocked production directly while keeping the other operating settings", () => {
  const { assets, miner } = minerFlowFixture();
  const node = { ...miner, machines: createMachineMembers(2, { clockPercent: 125 }) };
  const editor = createFactoryEditor(assets.catalog, { nodes: [node], links: [] });
  editor.setFlowClock(node.id, 100);
  const after = editor.getNode(node.id);
  if (after?.kind !== "extractor") throw new Error("Expected miner");
  expect(after.machines).toHaveLength(2);
  expect(after.flow?.targets).toBeUndefined();
  expect(after.machines[0]!.clockPercent).toBe(100);
  expect(editor.getPortRate(node.id, "output:copper")).toBe("240");
  editor.setMachineCount(node.id, 3);
  expect(editor.getPortRate(node.id, "output:copper")).toBe("360");
  expect(editor.getNode(node.id)).toMatchObject({
    machines: Array.from({ length: 3 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  editor.historyCommand("undo");
  expect(editor.getPortRate(node.id, "output:copper")).toBe("240");
  editor.historyCommand("undo");
  expect(editor.getPortRate(node.id, "output:copper")).toBe("300");
});

it("propagates unlocked source edits without resizing the edited group or creating a lock", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setFlowClock("miner", 100);
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  expect(editor.getPortRate("smelter", "output:iron")).toBe("120");
  editor.setMachineCount("miner", 2);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("240");
  editor.setOperatingSetting("miner", "all", "purity", 0.5);
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  expect(editor.getPortRate("smelter", "output:iron")).toBe("120");
  const miner = editor.getNode("miner");
  if (miner?.kind !== "extractor") throw new Error("Expected miner");
  expect(miner.flow?.targets).toBeUndefined();
  expect(miner.machines).toHaveLength(2);
  expect(miner.machines.every((member) => member.clockPercent === 100)).toBe(true);
  editor.setFlowClock("smelter", 50);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("60");
  expect(editor.getNode("smelter")).toMatchObject({
    machines: Array.from({ length: 4 }, () => expect.objectContaining({ clockPercent: 50 })),
  });
  expect(editor.getPortRate("miner", "output:copper")).toBe("60");
});

it("keeps heterogeneous miner settings and exact supply through unlocked count edits", () => {
  const { assets, document, miner, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    ...document,
    nodes: [
      {
        ...miner,
        machines: [
          { ...miner.machines[0]!, id: "pure", purity: 2 },
          { ...miner.machines[0]!, id: "impure", purity: 0.5 },
        ],
      },
      { ...smelter, machines: createMachineMembers(9) },
    ],
  });
  editor.setOperatingSetting("miner", "pure", "clockPercent", 100);
  expect(editor.getPortRate("miner", "output:copper")).toBe("300");
  editor.setMachineCount("miner", 3);
  expect(editor.getPortRate("miner", "output:copper")).toBe("360");
  expect(editor.getPortRate("smelter", "output:iron")).toBe("360");
  expect(editor.getNode("miner")).toMatchObject({
    machines: [
      expect.objectContaining({ purity: 2, clockPercent: 100 }),
      expect.objectContaining({ purity: 0.5, clockPercent: 100 }),
      expect.objectContaining({ purity: 0.5, clockPercent: 100 }),
    ],
  });
});
