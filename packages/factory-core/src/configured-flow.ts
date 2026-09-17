import type { GameCatalog } from "@satisfactory-belt/game-data";

import { createConnectionIndex } from "./links";
import type { FactoryDocument } from "./links";
import type { PortReference } from "./ports";
import { resolveProduction } from "./production";
import type { MaterialRate } from "./production";
import { resolveSemanticPorts } from "./semantic-ports";

/** Nominal supply along unambiguous paths. Does not solve demand, capacity, or branch allocation. */
export function configuredIncomingRates(
  document: FactoryDocument,
  catalog: GameCatalog,
  nodeId: string,
): readonly MaterialRate[] {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const ports = document.nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
  const index = createConnectionIndex(ports, document.links);
  const memo = new Map<string, number | null>();
  function outputRate(ref: PortReference, itemId: string, visiting: Set<string>): number | null {
    const key = JSON.stringify([ref.nodeId, ref.portKey, itemId]);
    if (memo.has(key)) return memo.get(key)!;
    if (visiting.has(key)) return null;
    if (
      document.links.filter(
        (link) => link.output.nodeId === ref.nodeId && link.output.portKey === ref.portKey,
      ).length !== 1
    )
      return null;
    const node = nodes.get(ref.nodeId);
    if (!node) return null;
    const next = new Set(visiting);
    next.add(key);
    let result: number | null = null;
    if (
      node.kind === "logistics" ||
      (node.kind === "facility" && node.configuration.type === "storage")
    ) {
      const outputs = ports.filter(
        (port) =>
          port.nodeId === node.id &&
          port.direction === "output" &&
          index.materials(port).has(itemId) &&
          document.links.some(
            (link) => link.output.nodeId === port.nodeId && link.output.portKey === port.portKey,
          ),
      );
      if (outputs.length === 1) result = sumInputs(node.id, itemId, next);
    } else {
      result =
        resolveProduction(node, catalog).outputs.find((rate) => rate.itemId === itemId)
          ?.perMinute ?? null;
    }
    memo.set(key, result);
    return result;
  }
  function sumInputs(id: string, itemId: string, visiting: Set<string>): number | null {
    let sum = 0;
    for (const link of document.links.filter(
      (entry) => entry.input.nodeId === id && index.materials(entry.output).has(itemId),
    )) {
      const rate = outputRate(link.output, itemId, visiting);
      if (rate === null) return null;
      sum += rate;
    }
    return sum;
  }
  const materials = new Set(
    ports
      .filter((port) => port.nodeId === nodeId && port.direction === "input")
      .flatMap((port) => Array.from(index.materials(port))),
  );
  return [...materials].map((itemId) => ({
    itemId,
    perMinute: sumInputs(nodeId, itemId, new Set()),
  }));
}
