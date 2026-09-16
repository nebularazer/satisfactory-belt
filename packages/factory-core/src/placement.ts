import type { Point, PortReference } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

import { resolveFactoryNode } from "./index";
import type { FactoryNode } from "./index";
import { createConnectionIndex } from "./links";
import type { MaterialLink } from "./links";
import type { SemanticPort } from "./ports";
import { resolveSemanticPorts } from "./semantic-ports";

export type NodeConfiguration =
  | { kind: "manufacturing"; recipeId: string; machineId: string }
  | { kind: "extractor"; extractorId: string; resourceId: string }
  | { kind: "logistics"; partId: string }
  | { kind: "sink"; sinkId: string }
  | { kind: "fixed-producer"; producerId: string };

/** Construct and validate the same defaults for search candidates and committed nodes. */
export function createFactoryNode(
  catalog: GameCatalog,
  configuration: NodeConfiguration,
  id: string,
  position: Point,
): FactoryNode {
  const base = { id, ...position, machineCount: 1 };
  const node: FactoryNode =
    configuration.kind === "manufacturing"
      ? { ...configuration, ...base, clockPercent: 100, sloopsUsed: 0 }
      : configuration.kind === "extractor"
        ? { ...configuration, ...base, clockPercent: 100 }
        : configuration.kind === "logistics"
          ? { ...configuration, id, ...position }
          : { ...configuration, ...base };
  resolveFactoryNode(node, catalog);
  return node;
}

/** Candidate ports retain their display order; the first compatible port wins. */
export function firstPlacementConnection(
  catalog: GameCatalog,
  ports: readonly SemanticPort[],
  links: readonly MaterialLink[],
  source: PortReference,
  node: FactoryNode,
) {
  const candidates = resolveSemanticPorts(node, catalog);
  const index = createConnectionIndex([...ports, ...candidates], links);
  for (const candidate of candidates) {
    const result = index.compatibility(source, candidate);
    if (result.compatible)
      return {
        output: { nodeId: result.output.nodeId, portKey: result.output.portKey },
        input: { nodeId: result.input.nodeId, portKey: result.input.portKey },
      };
  }
  return null;
}
