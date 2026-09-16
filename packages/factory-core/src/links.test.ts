import { expect, it } from "vitest";

import { createConnectionIndex } from "./links";
import type { MaterialLink } from "./links";
import type { SemanticPort } from "./ports";
const port = (
  nodeId: string,
  direction: "input" | "output",
  itemId: string | null,
  portKey = direction,
): SemanticPort => ({ nodeId, direction, itemId, portKey, transport: "belt" });
const link = (output: SemanticPort, input: SemanticPort): MaterialLink => ({
  id: `${output.nodeId}:${input.nodeId}`,
  output,
  input,
});

it("permits many-to-many aggregate links but rejects the same normalized pair twice", () => {
  const a = port("a", "output", "iron"),
    b = port("b", "output", "iron"),
    c = port("c", "input", "iron"),
    d = port("d", "input", "iron");
  const index = createConnectionIndex([a, b, c, d], [link(a, c)]);
  expect(index.compatibility(a, d).compatible).toBe(true);
  expect(index.compatibility(b, c).compatible).toBe(true);
  expect(index.compatibility(c, a)).toEqual({ compatible: false, reason: "duplicate-link" });
  expect(index.targets(a)).toEqual([d]);
});

it("infers material across logistics slots and chains, and frees detached components", () => {
  const iron = port("iron", "output", "iron"),
    copper = port("copper", "input", "copper");
  const a = port("splitter", "input", null),
    b = port("splitter", "output", null);
  const c = port("merger", "input", null),
    d = port("merger", "output", null);
  const ports = [iron, copper, a, b, c, d];
  const chain = link(b, c);
  const unassigned = createConnectionIndex(ports, [chain]);
  expect(unassigned.material(d)).toBeNull();
  expect(unassigned.compatibility(d, copper).compatible).toBe(true);
  const assigned = createConnectionIndex(ports, [chain, link(iron, a)]);
  expect(assigned.material(d)).toBe("iron");
  expect(assigned.compatibility(d, copper)).toEqual({
    compatible: false,
    reason: "different-material",
  });
  expect(assigned.targets(d)).not.toContain(copper);
  expect(createConnectionIndex(ports, [chain]).material(d)).toBeNull();
});

it("rejects an upstream addition that would clog a downstream machine in either click order", () => {
  const iron = port("iron", "output", "iron"),
    copper = port("copper", "input", "copper");
  const a = port("a", "input", null),
    b = port("a", "output", null),
    c = port("b", "input", null),
    d = port("b", "output", null);
  const index = createConnectionIndex([iron, copper, a, b, c, d], [link(iron, a), link(d, copper)]);
  expect(index.compatibility(b, c)).toEqual({ compatible: false, reason: "different-material" });
  expect(index.compatibility(c, b)).toEqual({ compatible: false, reason: "different-material" });
});

it("protects an existing machine branch when a second material is added upstream of a splitter", () => {
  const iron = port("iron", "output", "iron");
  const copper = port("copper", "output", "copper");
  const mergeIn = port("merger", "input", null);
  const spareIn = port("merger", "input", null, "input:1");
  const mergeOut = port("merger", "output", null);
  const splitIn = port("splitter", "input", null);
  const splitOut = port("splitter", "output", null);
  const consumer = port("machine", "input", "iron");
  const sink = { ...port("sink", "input", null), accepts: new Set(["iron", "copper"]) };
  const ports = [iron, copper, mergeIn, spareIn, mergeOut, splitIn, splitOut, consumer, sink];
  const links = [link(iron, mergeIn), link(mergeOut, splitIn), link(splitOut, sink)];
  const connected = createConnectionIndex(ports, [...links, link(splitOut, consumer)]);
  expect(connected.compatibility(copper, spareIn).compatible).toBe(false);
  expect(connected.compatibility(spareIn, copper).compatible).toBe(false);
  expect(connected.materials(splitOut)).toEqual(new Set(["iron"]));
  expect(connected.targets(copper)).not.toContainEqual(spareIn);
  const withoutMachine = createConnectionIndex(ports, links);
  expect(withoutMachine.compatibility(copper, spareIn).compatible).toBe(true);
  const mixed = createConnectionIndex(ports, [...links, link(copper, spareIn)]);
  expect(mixed.materials(sink)).toEqual(new Set(["iron", "copper"]));
});

it("does not propagate material across a recipe and permits matching-material feedback cycles", () => {
  const input = port("machine", "input", "ore"),
    output = port("machine", "output", "plate");
  const a = port("logistics", "input", null),
    b = port("logistics", "output", null);
  const index = createConnectionIndex([input, output, a, b], [link(output, a)]);
  expect(index.material(input)).toBeNull();
  expect(index.material(output)).toBe("plate");
  expect(index.compatibility(b, input).compatible).toBe(false);
  const recycled = { ...input, itemId: "plate" };
  expect(
    createConnectionIndex([recycled, output, a, b], [link(output, a)]).compatibility(b, recycled)
      .compatible,
  ).toBe(true);
});

it("applies matching-material and direction rules to pipes without limiting fan-out", () => {
  const a = { ...port("a", "output", "water"), transport: "pipe" as const };
  const b = { ...port("b", "input", "water"), transport: "pipe" as const };
  const c = { ...b, nodeId: "c" };
  const gas = { ...b, nodeId: "gas", itemId: "nitrogen" };
  const wildcard = port("splitter", "input", null);
  const index = createConnectionIndex([a, b, c, gas, wildcard], [link(a, b)]);
  expect(index.targets(a)).toEqual([c]);
  expect(index.compatibility(a, gas).compatible).toBe(false);
  expect(index.compatibility(a, wildcard).compatible).toBe(false);
});

it("merges three different inputs into a mixed stream and forwards it through normal splitters", () => {
  const sources = ["iron", "copper", "plastic"].map((item) => port(item, "output", item));
  const inputs = sources.map((_, i) => ({
    ...port("merger", "input", null),
    portKey: `input:${i}`,
  }));
  const merged = port("merger", "output", null);
  const splitInput = port("splitter", "input", null);
  const splitOutputs = [0, 1, 2].map((i) =>
    Object.assign(port("splitter", "output", null), { portKey: `output:${i}` }),
  );
  const consumer = port("machine", "input", "iron");
  const moreLogistics = port("another-merger", "input", null);
  const ports = [
    ...sources,
    ...inputs,
    merged,
    splitInput,
    ...splitOutputs,
    consumer,
    moreLogistics,
  ];
  const links: MaterialLink[] = [];
  sources.forEach((source, i) => {
    expect(createConnectionIndex(ports, links).compatibility(source, inputs[i]).compatible).toBe(
      true,
    );
    links.push(link(source, inputs[i]));
  });
  const mixed = createConnectionIndex(ports, links);
  expect(mixed.materials(merged)).toEqual(new Set(["iron", "copper", "plastic"]));
  inputs.forEach((input, i) =>
    expect(mixed.materials(input)).toEqual(new Set([sources[i].itemId])),
  );
  expect(mixed.compatibility(merged, consumer)).toEqual({
    compatible: false,
    reason: "mixed-material",
  });
  expect(mixed.compatibility(merged, moreLogistics).compatible).toBe(true);
  expect(mixed.compatibility(merged, splitInput).compatible).toBe(true);
  const split = createConnectionIndex(ports, [...links, link(merged, splitInput)]);
  for (const output of splitOutputs) {
    expect(split.materials(output)).toEqual(new Set(["iron", "copper", "plastic"]));
    expect(split.compatibility(output, consumer).compatible).toBe(false);
  }
  const disconnected = createConnectionIndex(ports, [links[0]]);
  expect(disconnected.materials(merged)).toEqual(new Set(["iron"]));
  expect(disconnected.compatibility(merged, consumer).compatible).toBe(true);
});

it("settles mixed-material cycles without propagating demand backwards into unrelated merger inputs", () => {
  const iron = port("iron", "output", "iron"),
    copper = port("copper", "output", "copper");
  const a = port("a", "input", null),
    b = port("a", "output", null),
    c = port("b", "input", null),
    d = port("b", "output", null);
  const empty = { ...a, portKey: "input:unused" };
  const index = createConnectionIndex(
    [iron, copper, a, b, c, d, empty],
    [link(iron, a), link(copper, c), link(b, c), link(d, a)],
  );
  expect(index.materials(b)).toEqual(new Set(["iron", "copper"]));
  expect(index.materials(d)).toEqual(new Set(["iron", "copper"]));
  expect(index.materials(empty).size).toBe(0);
});

it("accepts mixed sinkable materials at a sink and rejects unsinkable items even when added upstream later", () => {
  const iron = port("iron", "output", "iron"),
    copper = port("copper", "output", "copper"),
    waste = port("waste", "output", "waste");
  const mergeIn = port("merger", "input", null),
    mergeOut = port("merger", "output", null);
  const sink = { ...port("sink", "input", null), accepts: new Set(["iron", "copper"]) };
  const ports = [iron, copper, waste, mergeIn, mergeOut, sink];
  const links = [link(iron, mergeIn), link(copper, mergeIn)];
  const index = createConnectionIndex(ports, links);
  expect(index.compatibility(mergeOut, sink).compatible).toBe(true);
  expect(index.compatibility(waste, sink)).toEqual({
    compatible: false,
    reason: "unsinkable-material",
  });
  expect(
    createConnectionIndex(ports, [...links, link(mergeOut, sink)]).compatibility(waste, mergeIn),
  ).toEqual({ compatible: false, reason: "unsinkable-material" });
});

it("validates each branch after filtering and keeps overflow potentially mixed", () => {
  const iron = port("iron", "output", "iron"),
    copper = port("copper", "output", "copper");
  const input = port("smart", "input", null),
    consumer = port("machine", "input", "iron");
  const definedItems = new Set(["iron"]);
  const sorted = {
    ...port("smart", "output", null),
    portKey: "output:0",
    filter: { rules: [{ kind: "item" as const, itemId: "iron" }], definedItems },
  };
  const overflow = {
    ...sorted,
    portKey: "output:1",
    filter: { rules: [{ kind: "overflow" as const }], definedItems },
  };
  const undefinedItems = {
    ...sorted,
    portKey: "output:2",
    filter: { rules: [{ kind: "any-undefined" as const }], definedItems },
  };
  const sink = { ...port("sink", "input", null), accepts: new Set(["iron", "copper"]) };
  const ports = [iron, copper, input, sorted, overflow, undefinedItems, consumer, sink];
  const links = [link(iron, input), link(sorted, consumer), link(overflow, sink)];
  expect(createConnectionIndex(ports, links).compatibility(copper, input).compatible).toBe(true);
  const connected = createConnectionIndex(ports, [...links, link(copper, input)]);
  expect(connected.materials(sorted)).toEqual(new Set(["iron"]));
  expect(connected.materials(undefinedItems)).toEqual(new Set(["copper"]));
  expect(connected.materials(overflow)).toEqual(new Set(["iron", "copper"]));
  expect(connected.compatibility(overflow, consumer).compatible).toBe(false);
  expect(connected.compatibility(undefinedItems, consumer).compatible).toBe(false);
});

it("blocks disabled outputs even on an unassigned splitter", () => {
  const none = {
    ...port("smart", "output", null),
    filter: { rules: [{ kind: "none" as const }], definedItems: new Set<string>() },
  };
  const input = port("machine", "input", "iron");
  expect(createConnectionIndex([none, input], []).compatibility(none, input)).toEqual({
    compatible: false,
    reason: "disabled-output",
  });
});
