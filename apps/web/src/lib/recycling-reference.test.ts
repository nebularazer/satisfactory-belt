import { createMachineMembers } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { recyclingFlowFixture } from "../test/recycling-flow-fixture";
import { createFactoryEditor } from "./factory-editor";

it("keeps the recycling flow unchanged when overclocking is replaced by equivalent machine counts", () => {
  const { assets, document } = recyclingFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  for (const id of ["recycling-plastic", "recycling-rubber"]) {
    const before = editor.history.getSnapshot().state;
    editor.updateNodes((nodes) =>
      nodes.map((node) =>
        node.id === id && node.kind === "manufacturing"
          ? { ...node, machines: createMachineMembers(20) }
          : node,
      ),
    );
    for (const node of before.nodes) if (node.id !== id) expect(editor.getNode(node.id)).toBe(node);
    expect(editor.getFlowAnalysis().status).toBe("feasible");
    expect(editor.getPortRate("recycling-plastic-storage", "input:0")).toBe("600");
    expect(editor.getPortRate("recycling-rubber-storage", "input:0")).toBe("750");
  }
});

it.each([false, true])(
  "reconnects the recycling loop without resizing, with storage connected first: %s",
  (storageFirst) => {
    const { assets, document } = recyclingFlowFixture();
    const editor = createFactoryEditor(assets.catalog, document);
    const production = document.nodes.filter((node) => node.kind !== "logistics");
    const unchanged = () =>
      expect(
        editor.history.getSnapshot().state.nodes.filter((node) => node.kind !== "logistics"),
      ).toEqual(production);
    expect(editor.getFlowAnalysis().status).toBe("feasible");
    // Repeat for both splitters, reproducing the screenshot and then a fully direct graph.
    for (const [material, other] of [
      ["rubber", "plastic"],
      ["plastic", "rubber"],
    ]) {
      const itemId = material === "rubber" ? "Desc_Rubber_C" : "Desc_Plastic_C";
      editor.controller.setSelection(new Set([`recycling-${material}-splitter`]));
      editor.deleteSelection();
      unchanged();
      const targets = [
        { nodeId: `recycling-${material}-storage`, portKey: "input:0" },
        { nodeId: `recycling-${other}`, portKey: `input:${itemId}` },
      ];
      if (!storageFirst) targets.reverse();
      for (const target of targets) {
        editor.connect({ nodeId: `recycling-${material}`, portKey: `output:${itemId}` }, target);
        unchanged();
      }
      expect(editor.getFlowAnalysis().status).toBe("feasible");
      expect(editor.getPortRate("recycling-plastic-storage", "input:0")).toBe("600");
      expect(editor.getPortRate("recycling-rubber-storage", "input:0")).toBe("750");
      editor.historyCommand("undo");
      unchanged();
      editor.historyCommand("redo");
      unchanged();
      expect(editor.getFlowAnalysis().status).toBe("feasible");
    }
    expect(editor.history.getSnapshot().state.externalFlows).toEqual(document.externalFlows);
    expect(
      editor.getFlowAnalysis().balances.find((row) => row.itemId === "Desc_Rubber_C")?.stored,
    ).toBeCloseTo(750);
  },
);

it("trades refinery count against clock without changing either production target or storage surplus", () => {
  const { assets, document } = recyclingFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setMachineCount("recycling-plastic", 13);
  expect(editor.getNode("recycling-plastic")).toMatchObject({
    machines: Array.from({ length: 13 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(2000 / 13, 6) }),
    ),
  });
  expect(editor.getPortRate("recycling-plastic-storage", "input:0")).toBe("600");
  editor.setMachineCount("recycling-plastic", 20);
  editor.setOperatingSetting("recycling-plastic", "all", "clockPercent", 100);
  editor.setOperatingSetting("recycling-rubber", "all", "clockPercent", 100);
  for (const id of ["recycling-plastic", "recycling-rubber"])
    expect(editor.getNode(id)).toMatchObject({
      machines: Array.from({ length: 20 }, () => expect.objectContaining({ clockPercent: 100 })),
    });
  expect(editor.getPortRate("recycling-plastic-storage", "input:0")).toBe("600");
  expect(editor.getPortRate("recycling-rubber-storage", "input:0")).toBe("750");
  expect(editor.getFlowAnalysis().status).toBe("feasible");
  editor.historyCommand("undo");
  expect(editor.getNode("recycling-rubber")).toMatchObject({
    machines: Array.from({ length: 12 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(500 / 3, 6) }),
    ),
  });
});

it("rebalances both recycling groups to whole counts at 100% without changing output or locks", () => {
  const { assets, document } = recyclingFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  for (const id of ["recycling-plastic", "recycling-rubber"]) {
    editor.rebalanceAt100(id);
    expect(editor.getNode(id)).toMatchObject({
      machines: Array.from({ length: 20 }, () => expect.objectContaining({ clockPercent: 100 })),
    });
  }
  expect(editor.getPortRate("recycling-plastic-storage", "input:0")).toBe("600");
  expect(editor.getPortRate("recycling-rubber-storage", "input:0")).toBe("750");
  // The same action on an automatic supplier keeps it unlocked.
  editor.rebalanceAt100("recycling-residue");
  expect(editor.getNode("recycling-residue")).toMatchObject({
    flow: { clockPercent: 100 },
    machines: Array.from({ length: 15 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  const node = editor.getNode("recycling-residue");
  expect(node?.kind === "manufacturing" && node.flow?.targets).toBeUndefined();
});
