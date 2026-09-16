import { portId } from "@satisfactory-belt/canvas-core";
import type { PortReference, RouteGuide } from "@satisfactory-belt/canvas-core";

import type { FactoryNode } from "./index";
import { createPortIndex } from "./ports";
import type { SemanticPort } from "./ports";
import { filterAllows } from "./splitters";

export type MaterialLink = Readonly<{
  id: string;
  output: PortReference;
  input: PortReference;
  guides?: readonly RouteGuide[];
}>;
export type FactoryDocument = Readonly<{
  nodes: readonly FactoryNode[];
  links: readonly MaterialLink[];
}>;

const pairKey = (a: PortReference, b: PortReference) => JSON.stringify([portId(a), portId(b)]);

/** Follow material downstream. A normal logistics node forwards every possible input material. */
export function createConnectionIndex(
  ports: readonly SemanticPort[],
  links: readonly MaterialLink[],
) {
  const byId = new Map(ports.map((port) => [portId(port), port]));
  const outgoing = new Map<string, Set<string>>();
  const outputs = new Map<string, string[]>();
  const flows = new Map<string, Set<string>>();
  const pairs = new Set<string>();
  function edge(from: string, to: string) {
    const targets = outgoing.get(from) ?? new Set<string>();
    targets.add(to);
    outgoing.set(from, targets);
  }
  for (const port of ports) {
    const id = portId(port);
    flows.set(
      id,
      new Set(port.direction === "output" && port.itemId !== null ? [port.itemId] : []),
    );
    if (port.itemId === null && port.direction === "output") {
      const entries = outputs.get(port.nodeId) ?? [];
      entries.push(id);
      outputs.set(port.nodeId, entries);
    }
  }
  for (const port of ports)
    if (port.itemId === null && port.direction === "input")
      for (const output of outputs.get(port.nodeId) ?? []) edge(portId(port), output);
  for (const link of links) {
    edge(portId(link.output), portId(link.input));
    pairs.add(pairKey(link.output, link.input));
  }
  // Monotonic sets terminate even for recycling loops. No item ordering or rates are inferred.
  const queue = [...flows].filter(([, items]) => items.size).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const target of outgoing.get(id) ?? []) {
      const items = flows.get(target);
      if (!items) continue;
      const before = items.size;
      for (const item of flows.get(id)!)
        if (filterAllows(byId.get(target)?.filter, item)) items.add(item);
      if (items.size !== before) queue.push(target);
    }
  }
  const base = createPortIndex(ports);
  const cache = new Map<string, ReturnType<typeof base.compatibility>>();
  const compatibility: typeof base.compatibility = (a, b) => {
    const result = base.compatibility(a, b);
    if (!result.compatible) return result;
    const output = byId.get(portId(result.output))!;
    const input = byId.get(portId(result.input))!;
    if (output.filter && output.filter.rules.every((rule) => rule.kind === "none"))
      return { compatible: false, reason: "disabled-output" };
    if (input.itemId !== null && !filterAllows(output.filter, input.itemId))
      return { compatible: false, reason: "filtered-material" };
    const key = pairKey(result.output, result.input);
    if (pairs.has(key)) return { compatible: false, reason: "duplicate-link" };
    const cached = cache.get(key);
    if (cached) return cached;
    const source = portId(result.output),
      target = portId(result.input);
    const incoming = flows.get(source)!;
    const visited = new Set<string>();
    const pending = [...incoming].map((item) => ({ id: target, item }));
    // Validate each possible material along its filtered downstream paths, including existing consumers.
    for (let i = 0; i < pending.length; i++) {
      const { id, item } = pending[i]!;
      const visit = JSON.stringify([id, item]);
      if (visited.has(visit)) continue;
      visited.add(visit);
      const port = byId.get(id);
      if (!port || !filterAllows(port.filter, item)) continue;
      if (
        port.direction === "input" &&
        (port.accepts ? !port.accepts.has(item) : port.itemId !== null && port.itemId !== item)
      ) {
        const invalid = {
          compatible: false as const,
          reason: port.accepts
            ? "unsinkable-material"
            : incoming.size > 1
              ? "mixed-material"
              : "different-material",
        };
        cache.set(key, invalid);
        return invalid;
      }
      for (const next of outgoing.get(id) ?? []) pending.push({ id: next, item });
    }
    cache.set(key, result);
    return result;
  };
  return {
    compatibility,
    targets: (ref: PortReference) =>
      base.targets(ref).filter((target) => compatibility(ref, target).compatible),
    materials: (ref: PortReference): ReadonlySet<string> =>
      flows.get(portId(ref)) ?? new Set<string>(),
    material: (ref: PortReference): string | null => {
      const items = flows.get(portId(ref));
      return items?.size === 1 ? items.values().next().value! : null;
    },
  };
}
