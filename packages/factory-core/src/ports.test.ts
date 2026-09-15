import { expect, it } from "vitest";

import { createPortIndex, getPortCompatibility } from "./ports";
import type { SemanticPort } from "./ports";
const output: SemanticPort = {
  nodeId: "source",
  portKey: "output:water",
  direction: "output",
  itemId: "water",
  transport: "pipe",
};
const input: SemanticPort = {
  nodeId: "target",
  portKey: "input:water",
  direction: "input",
  itemId: "water",
  transport: "pipe",
};
it("normalizes both selection orders into output to input", () => {
  for (const [a, b] of [
    [output, input],
    [input, output],
  ])
    expect(getPortCompatibility(a, b)).toEqual({ compatible: true, output, input });
});
it.each([
  [undefined, "missing-port"],
  [{ ...input, nodeId: output.nodeId }, "same-node"],
  [{ ...input, direction: "output" }, "same-direction"],
  [{ ...input, itemId: "nitrogen" }, "different-material"],
  [{ ...input, transport: "belt" }, "different-transport"],
] as const)("rejects incompatible ports: %s", (candidate, reason) => {
  expect(getPortCompatibility(output, candidate)).toEqual({ compatible: false, reason });
});
it("indexes stable references by material, transport and direction", () => {
  const ports = [
    input,
    { ...input, nodeId: "gas", itemId: "nitrogen" },
    { ...input, nodeId: "belt", transport: "belt" as const },
    { ...input, nodeId: "source" },
    output,
  ];
  const index = createPortIndex(ports);
  expect(index.targets({ nodeId: "source", portKey: "output:water" })).toEqual([input]);
  expect(index.targets(input)).toEqual([output]);
  expect(index.targets({ ...output, portKey: "removed" })).toEqual([]);
});

it("treats logistics ports as any solid belt, in either selection order", () => {
  const logistics: SemanticPort = {
    nodeId: "splitter",
    portKey: "input:0",
    direction: "input",
    transport: "belt",
    itemId: null,
  };
  const solid = { ...output, portKey: "output:iron", transport: "belt" as const, itemId: "iron" };
  const otherLogistics = { ...solid, itemId: null, portKey: "output:1" };
  for (const candidate of [solid, otherLogistics]) {
    expect(getPortCompatibility(logistics, candidate).compatible).toBe(true);
    expect(getPortCompatibility(candidate, logistics).compatible).toBe(true);
  }
  expect(getPortCompatibility(logistics, output)).toEqual({
    compatible: false,
    reason: "different-transport",
  });
  expect(getPortCompatibility(logistics, { ...otherLogistics, nodeId: logistics.nodeId })).toEqual({
    compatible: false,
    reason: "same-node",
  });
  const index = createPortIndex([logistics, solid, otherLogistics, output]);
  expect(index.targets(logistics)).toEqual([solid, otherLogistics]);
  expect(index.targets(solid)).toEqual([logistics]);
  expect(index.targets(otherLogistics)).toEqual([logistics]);
  expect(index.targets(output)).toEqual([]);
});
