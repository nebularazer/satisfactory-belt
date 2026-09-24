/* oxlint-disable oxc/no-map-spread -- Immutable fixtures. */
import { isFlowGroup, productionLimit, resolveFactoryNode } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

it("keeps an output limit stable across manual clocks and Auto rounding", () => {
  const { assets, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, { nodes: [smelter], links: [] });
  editor.setLimit(smelter.id, { kind: "output", itemId: "iron", value: 75 });
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 3 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(250 / 3) }),
    ),
  });
  editor.setClock(smelter.id, 100);
  expect(editor.getNode(smelter.id)).toMatchObject({
    flow: {
      outputLimit: { itemId: "iron", perMinute: 75 },
      machineLimit: null,
      clockMode: "manual",
      utilization: expect.closeTo(5 / 6),
    },
    machines: Array.from({ length: 3 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("75");
  expect(resolveFactoryNode(editor.getNode(smelter.id)!, assets.catalog)).toMatchObject({
    powerLabel: "10 MW",
  });
  editor.setClock(smelter.id, 50);
  expect(editor.getNode(smelter.id)).toMatchObject({
    flow: { outputLimit: { itemId: "iron", perMinute: 75 }, utilization: 1 },
    machines: Array.from({ length: 5 }, () => expect.objectContaining({ clockPercent: 50 })),
  });
  editor.setClock(smelter.id, null);
  expect(editor.getNode(smelter.id)).toMatchObject({
    flow: { outputLimit: { itemId: "iron", perMinute: 75 }, clockMode: "auto" },
    machines: Array.from({ length: 3 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(250 / 3) }),
    ),
  });
});

it("converts the authored machine limit rather than temporarily used throughput", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setLimit("miner", { kind: "machines", value: 1 });
  editor.setLimit("smelter", { kind: "output", itemId: "iron", value: 30 });
  expect(editor.getPortRate("miner", "output:copper")).toBe("30");
  editor.convertLimit("miner", "copper");
  expect(editor.getNode("miner")).toMatchObject({
    flow: { machineLimit: null, outputLimit: { itemId: "copper", perMinute: 120 } },
  });
  editor.setOperatingSetting("miner", "all", "purity", 2);
  expect(editor.getNode("miner")).toMatchObject({
    flow: { outputLimit: { itemId: "copper", perMinute: 120 } },
  });
  editor.convertLimit("miner", "machines");
  expect(editor.getNode("miner")).toMatchObject({ flow: { machineLimit: 1, targets: {} } });
});

it("keeps machine limits through clock edits, shortages, undo and serialized reload", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setLimit("miner", { kind: "machines", value: 1 });
  editor.setLimit("smelter", { kind: "output", itemId: "iron", value: 90 });
  editor.setClock("miner", 100);
  expect(editor.getNode("miner")).toMatchObject({
    flow: { machineLimit: 1, utilization: 0.75 },
    machines: [expect.objectContaining({ clockPercent: 100 })],
  });
  editor.setClock("miner", 50);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("60");
  expect(editor.getNode("smelter")).toMatchObject({
    flow: { outputLimit: { itemId: "iron", perMinute: 90 } },
  });
  const saved = editor.history.getSnapshot().state;
  const restored = createFactoryEditor(assets.catalog, structuredClone(saved));
  expect(restored.getPortRate("smelter", "output:iron")).toBe("60");
  editor.historyCommand("undo");
  expect(editor.getPortRate("smelter", "output:iron")).toBe("90");
  editor.historyCommand("redo");
  expect(editor.history.getSnapshot().state).toBe(saved);
  editor.setLimit("miner", null);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("90");
  const miner = editor.getNode("miner")!;
  expect(isFlowGroup(miner) && productionLimit(miner)).toBeNull();
});

it("rejects invalid limits atomically", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  const before = editor.history.getSnapshot().state;
  expect(() => editor.setLimit("miner", { kind: "machines", value: 1.5 })).toThrow();
  expect(() => editor.setLimit("miner", { kind: "output", itemId: "iron", value: 60 })).toThrow();
  expect(() => editor.setClock("miner", 300)).toThrow();
  expect(editor.history.getSnapshot().state).toBe(before);
});

it("treats an output limit as a ceiling and does not force unused production", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setLimit("miner", { kind: "output", itemId: "copper", value: 120 });
  editor.setLimit("smelter", { kind: "output", itemId: "iron", value: 45 });
  expect(editor.getPortRate("miner", "output:copper")).toBe("45");
  expect(editor.getPortRate("smelter", "output:iron")).toBe("45");
  editor.setClock("miner", 200);
  expect(editor.getPortRate("miner", "output:copper")).toBe("45");
  expect(editor.getNode("miner")).toMatchObject({
    flow: { outputLimit: { itemId: "copper", perMinute: 120 } },
    machines: [expect.objectContaining({ clockPercent: 200 })],
  });
  editor.setLimit("smelter", null);
  expect(editor.getPortRate("smelter", "output:iron")).toBe("120");
});
