import type { GameCatalog } from "@satisfactory-belt/game-data";

import { resolveFactoryNode } from "./index";
import type { FactoryNode, NodeDisplay } from "./index";
import type { SemanticPort } from "./ports";
import { splitterFilters } from "./splitters";

/** Derive connection rules independently of port labels and rendering. */
export function resolveSemanticPorts(
  node: FactoryNode,
  catalog: GameCatalog,
  display: NodeDisplay = resolveFactoryNode(node, catalog),
): readonly SemanticPort[] {
  const part = node.kind === "logistics" ? catalog.logistics[node.partId] : undefined;
  const filters =
    node.kind === "logistics" &&
    (part?.kind === "smart-splitter" || part?.kind === "programmable-splitter")
      ? splitterFilters(node.program)
      : undefined;
  const accepts =
    node.kind === "sink"
      ? new Set(
          Object.values(catalog.items)
            .filter((item) => item.form === "solid" && item.sinkable)
            .map((item) => item.id),
        )
      : undefined;
  return display.ports.map((port) => ({
    nodeId: node.id,
    portKey: port.key,
    direction: port.direction,
    transport: port.transport,
    itemId: port.itemId,
    ...(node.kind === "facility"
      ? {
          forwardsMaterials: node.configuration.type === "storage",
          allowsUnknownFluid: port.transport === "pipe" && port.itemId === null,
          ...(port.key === "input:fuel" && node.configuration.type === "truck-station"
            ? {
                accepts: new Set(
                  Object.values(catalog.items)
                    .filter((item) => item.form === "solid" && (item.energyMegajoules ?? 0) > 0)
                    .map((item) => item.id),
                ),
              }
            : {}),
        }
      : {}),
    ...(accepts && port.direction === "input" ? { accepts } : {}),
    ...(filters && port.direction === "output" ? { filter: filters.get(port.key) } : {}),
  }));
}
