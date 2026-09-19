import type { GameCatalog } from "@satisfactory-belt/game-data";

import type { FactoryNode, NodeDisplay } from "./index";
import { isMaterialTransport } from "./ports";
import type { SemanticPort, PortTransport } from "./ports";
import { resolveProduction } from "./production";
import { splitterFilters } from "./splitters";
import { validateFactoryNode } from "./validation";

/** Material identity and forwarding rules are independent of labels and port layout. */
export function resolveSemanticPorts(
  node: FactoryNode,
  catalog: GameCatalog,
  _display?: NodeDisplay,
): readonly SemanticPort[] {
  validateFactoryNode(node, catalog);
  const ports: SemanticPort[] = [];
  function add(
    direction: "input" | "output",
    portKey: string,
    itemId: string | null,
    transport: PortTransport = "belt",
    extra: Partial<SemanticPort> = {},
  ) {
    ports.push({
      nodeId: node.id,
      portKey,
      direction,
      itemId,
      transport:
        itemId && catalog.items[itemId]
          ? catalog.items[itemId].form === "solid"
            ? "belt"
            : "pipe"
          : transport,
      ...extra,
    });
  }
  if (node.kind === "logistics") {
    const kind = catalog.logistics[node.partId]!.kind;
    const filters =
      kind === "smart-splitter" || kind === "programmable-splitter"
        ? splitterFilters(node.program)
        : undefined;
    for (const direction of ["input", "output"] as const) {
      const count = (kind !== "merger") === (direction === "output") ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const key = `${direction}:${i}`;
        add(
          direction,
          key,
          null,
          "belt",
          direction === "output" ? { filter: filters?.get(key) } : {},
        );
      }
    }
  } else if (node.kind === "sink") {
    add("input", "input:0", null, "belt", {
      accepts: new Set(
        Object.values(catalog.items)
          .filter((item) => item.form === "solid" && item.sinkable)
          .map((item) => item.id),
      ),
    });
  } else {
    const production = resolveProduction(node, catalog);
    for (const direction of ["input", "output"] as const)
      for (const { itemId } of direction === "input" ? production.inputs : production.outputs)
        add(direction, `${direction}:${itemId}`, itemId);
    if (node.kind === "facility") {
      const c = node.configuration;
      const building = catalog.buildings![node.buildingId]!;
      if (c.type === "storage") {
        const count = building.id === "Build_StorageContainerMk2_C" ? 2 : 1;
        for (let i = 0; i < count; i++) {
          add("input", `input:${i}`, null, building.transport);
          add("output", `output:${i}`, null, building.transport);
        }
      }
      if (c.type === "depot") add("input", "input:0", null, building.transport);
      if (c.type === "truck-station") {
        const direction = c.mode === "load" ? "input" : "output";
        add(direction, `${direction}:cargo`, c.materialId, building.transport);
        add("input", "input:fuel", c.fuelId, "belt", {
          accepts: new Set(
            Object.values(catalog.items)
              .filter(
                (item) =>
                  (c.fuelId === null || c.fuelId === item.id) &&
                  item.form === "solid" &&
                  (item.energyMegajoules ?? 0) > 0,
              )
              .map((item) => item.id),
          ),
        });
      }
      if (c.type === "drone-port") {
        add("input", "input:cargo", c.outgoingItemId, building.transport);
        add("output", "output:cargo", c.incomingItemId, building.transport);
        add("input", "input:fuel", c.fuelId);
      }
      if (c.type === "train-station")
        c.platforms.forEach((platform, i) => {
          if (!platform) return;
          const transport = catalog.buildings![platform.buildingId]!.transport;
          const direction = platform.mode === "load" ? "input" : "output";
          for (let slot = 0; slot < 2; slot++)
            add(
              direction,
              `car:${i + 1}:${direction}:${slot}`,
              platform.materialId,
              transport,
              transport === "pipe" ? { materialGroup: `car:${i + 1}` } : {},
            );
        });
      if (c.type === "truck-station" || c.type === "train-station" || c.type === "drone-port") {
        const transport =
          c.type === "truck-station"
            ? "road-route"
            : c.type === "train-station"
              ? "rail-route"
              : "drone-route";
        add("input", "route:input", null, transport);
        add("output", "route:output", null, transport);
      }
      return ports.map((port) => ({
        ...port,
        forwardsMaterials: c.type === "storage" && isMaterialTransport(port.transport),
        allowsUnknownFluid: port.transport === "pipe" && port.itemId === null,
      }));
    }
  }
  return ports;
}
