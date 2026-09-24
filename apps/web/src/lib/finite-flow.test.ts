/* oxlint-disable oxc/no-map-spread -- Regression fixtures preserve immutable plans. */
import {
  flowCapacityNode,
  flowMachineLimit,
  isFlowGroup,
  resolveProduction,
} from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";

const smelt = { kind: "manufacturing", machineId: "smelter", recipeId: "ingot" } as const;
const mine = { kind: "extractor", extractorId: "miner", resourceId: "copper" } as const;
function setup() {
  const { assets } = minerFlowFixture();
  assets.catalog.extractors.miner!.baseRate = 60;
  assets.catalog.extractors.mk2 = { ...assets.catalog.extractors.miner!, id: "mk2", baseRate: 120 };
  const editor = createFactoryEditor(assets.catalog, { nodes: [], links: [] });
  const node = (id: string): FlowGroup => {
    const value = editor.getNode(id)!;
    if (!isFlowGroup(value)) throw new Error("Expected production group");
    return value;
  };
  const rate = (id: string) => resolveProduction(node(id), assets.catalog).outputs[0]!.perMinute!;
  const capacity = (id: string) =>
    resolveProduction(flowCapacityNode(node(id)), assets.catalog).outputs[0]!.perMinute!;
  const addMiner = (consumer?: string) =>
    editor.placeNode(
      mine,
      { x: 0, y: 0 },
      consumer ? { nodeId: consumer, portKey: "input:copper" } : undefined,
    ).id;
  const addSmelter = (supplier?: string) =>
    editor.placeNode(
      smelt,
      { x: 400, y: 0 },
      supplier ? { nodeId: supplier, portKey: "output:copper" } : undefined,
    ).id;
  return { assets, editor, node, rate, capacity, addMiner, addSmelter };
}

it("shares one finite miner across branches and preserves links through tier and purity changes", () => {
  const { editor, node, rate, addMiner, addSmelter, assets } = setup();
  const miner = addMiner();
  const consumers = [addSmelter(miner)];
  expect(rate(consumers[0]!)).toBe(60);
  consumers.push(addSmelter(miner));
  consumers.forEach((id) => expect(rate(id)).toBeCloseTo(30));
  consumers.push(addSmelter(miner));
  consumers.forEach((id) => expect(rate(id)).toBeCloseTo(20));
  const links = editor.history.getSnapshot().state.links;
  const source = node(miner);
  if (source.kind !== "extractor") throw new Error("Expected miner");
  editor.replaceNode({ ...source, extractorId: "mk2" });
  consumers.forEach((id) => expect(rate(id)).toBeCloseTo(40));
  for (const [purity, expected] of [
    [2, 80],
    [0.5, 20],
    [1, 40],
  ] as const) {
    editor.setOperatingSetting(miner, "all", "purity", purity);
    consumers.forEach((id) => expect(rate(id)).toBeCloseTo(expected));
    expect(node(miner).machines).toHaveLength(1);
    expect(editor.history.getSnapshot().state.links).toEqual(links);
  }
  const saved = editor.history.getSnapshot().state;
  const reopened = createFactoryEditor(assets.catalog, JSON.parse(JSON.stringify(saved)));
  for (const id of consumers) expect(reopened.getPortRate(id, "output:iron")).toBe("40");
  const reordered = createFactoryEditor(assets.catalog, {
    ...saved,
    nodes: saved.nodes.toReversed(),
    links: saved.links.toReversed(),
  });
  for (const id of consumers) expect(reordered.getPortRate(id, "output:iron")).toBe("40");
});

it("redistributes unused shares while keeping authored counts and ceilings through underuse", () => {
  const { editor, rate, capacity, node, addMiner, addSmelter } = setup();
  const miner = addMiner();
  editor.setOperatingSetting(miner, "all", "purity", 2);
  const consumers = Array.from({ length: 3 }, () => addSmelter(miner));
  editor.setMachineCount(consumers[0]!, 1);
  expect(consumers.map(rate)).toEqual([30, 45, 45]);
  for (const id of consumers) editor.setMachineCount(id, 1);
  expect(consumers.map(rate)).toEqual([30, 30, 30]);
  expect(rate(miner)).toBe(90);
  expect(capacity(miner)).toBe(120);
  editor.setOperatingSetting(miner, "all", "purity", 1);
  consumers.forEach((id) => expect(rate(id)).toBeCloseTo(20));
  consumers.forEach((id) => expect(flowMachineLimit(node(id))).toBe(1));
  editor.setOperatingSetting(miner, "all", "purity", 2);
  expect(consumers.map(rate)).toEqual([30, 30, 30]);
  editor.setAutomaticSizing(consumers[0]!, true);
  expect(consumers.map(rate)).toEqual([60, 30, 30]);
  expect(capacity(miner)).toBe(120);
  editor.historyCommand("undo");
  expect(consumers.map(rate)).toEqual([30, 30, 30]);
  editor.historyCommand("redo");
  expect(consumers.map(rate)).toEqual([60, 30, 30]);
});

it("builds backwards from a smelter and shares capped demand across suppliers", () => {
  const { editor, rate, capacity, addMiner, addSmelter } = setup();
  const smelter = addSmelter();
  const miners = [];
  for (let i = 1; i <= 3; i++) {
    miners.push(addMiner(smelter));
    expect(rate(smelter)).toBe(i * 60);
  }
  editor.setMachineCount(smelter, 1);
  miners.forEach((id) => expect(rate(id)).toBeCloseTo(10));
  editor.setProductionTarget(miners[0]!, "copper", 5);
  expect(miners.map(rate)).toEqual([expect.closeTo(5), expect.closeTo(12.5), expect.closeTo(12.5)]);
  editor.setOperatingSetting(miners[1]!, "all", "purity", 2);
  expect(miners.map(rate)).toEqual([expect.closeTo(5), expect.closeTo(12.5), expect.closeTo(12.5)]);
  expect(capacity(miners[1]!)).toBe(120);
  editor.setAutomaticSizing(smelter, true);
  expect(rate(smelter)).toBeCloseTo(185);
});

it("keeps explicit targets through shortages and only grows a miner in Auto mode", () => {
  const { editor, rate, node, addMiner, addSmelter } = setup();
  const miner = addMiner();
  const smelter = addSmelter(miner);
  editor.setProductionTarget(smelter, "iron", 180);
  expect(rate(smelter)).toBe(60);
  expect(node(smelter).flow?.targets).toEqual({ iron: 180 });
  expect(node(miner).machines).toHaveLength(1);
  editor.setAutomaticSizing(miner, true);
  expect(rate(smelter)).toBe(180);
  expect(node(miner).machines).toHaveLength(3);
  editor.setAutomaticSizing(miner, false);
  editor.setProductionTarget(miner, "copper", 90);
  editor.setOperatingSetting(miner, "all", "purity", 2);
  expect(rate(miner)).toBe(90);
  expect(node(miner).flow?.targets).toEqual({ copper: 90 });
  expect(node(miner).machines).toHaveLength(3);
  editor.setOperatingSetting(miner, "all", "purity", 0.5);
  expect(rate(miner)).toBe(90);
});

it("recovers idle branches when capacity increases without changing target priority", () => {
  const { editor, node, rate, addMiner, addSmelter } = setup();
  const miner = addMiner();
  const first = addSmelter(miner);
  editor.setProductionTarget(first, "iron", 60);
  const second = addSmelter(miner);
  expect(rate(first)).toBe(60);
  expect(rate(second)).toBe(0);
  editor.setOperatingSetting(miner, "all", "purity", 2);
  expect(rate(first)).toBe(60);
  expect(rate(second)).toBe(60);
  expect(node(first).flow?.targets).toEqual({ iron: 60 });
});

it("preserves other members' authored ceilings when editing an underused miner", () => {
  const { editor, node, rate, capacity, addMiner, addSmelter } = setup();
  const miner = addMiner();
  editor.setMachineCount(miner, 2);
  const smelter = addSmelter(miner);
  editor.setProductionTarget(smelter, "iron", 30);
  expect(rate(miner)).toBeCloseTo(30);
  expect(capacity(miner)).toBe(120);
  editor.setOperatingSetting(miner, node(miner).machines[0]!.id, "clockPercent", 50);
  expect(capacity(miner)).toBe(90);
  expect(rate(miner)).toBeCloseTo(30);
  editor.setProductionLocked(smelter, false);
  expect(rate(miner)).toBe(90);
  expect(rate(smelter)).toBe(90);
});
