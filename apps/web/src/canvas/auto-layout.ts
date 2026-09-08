import type { ELK, ElkNode } from "elkjs/lib/elk-api";
import type { CanvasDocument, CanvasNode } from "./document";
import { materialPortGeometry } from "./material-port-geometry";
import type { ConnectionRoute } from "./connection-route";
import { simplifyRoute } from "./orthogonal-router";
import {
  balancerLayoutBlocks,
  layoutPortKey as portKey,
  type LayoutBlock,
} from "./balancer-layout";

const STACK_GAP = 64;

function recipeColumns(document: CanvasDocument): LayoutBlock[] {
  const groups = new Map<string, CanvasNode[]>();
  for (const node of document.nodes.toSorted((a, b) =>
    a.configuration.id.localeCompare(b.configuration.id, "en", {
      numeric: true,
    }),
  )) {
    const configuration = node.configuration;
    const key = JSON.stringify(
      configuration.kind === "process"
        ? ["recipe", configuration.processId]
        : ["node", configuration.id],
    );
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }
  return [...groups].map(([id, nodes]) => {
    let height = 0;
    const members = nodes.map((node) => {
      const offsetY = height;
      height += node.height + STACK_GAP;
      return { node, offsetX: 0, offsetY };
    });
    return {
      id,
      members,
      width: Math.max(...nodes.map((node) => node.width)),
      height: height - STACK_GAP,
    };
  });
}

/** Computes presentation only. Node identities, port order and topology stay intact. */
export async function arrangeCanvas(
  document: CanvasDocument,
  elk: Pick<ELK, "layout">,
): Promise<CanvasDocument> {
  if (!document.nodes.length) return document;
  // Reserve recipe columns and balancer trees as complete obstacles before ELK
  // routes between them. Expand each block into its original cards afterwards.
  const balancers = balancerLayoutBlocks(document);
  const groupedRouters = new Set(
    balancers.flatMap((block) =>
      block.members.map(({ node }) => node.configuration.id),
    ),
  );
  const blocks = [
    ...recipeColumns({
      ...document,
      nodes: document.nodes.filter(
        (node) => !groupedRouters.has(node.configuration.id),
      ),
    }),
    ...balancers,
  ];
  const internalLinks = new Set(
    balancers.flatMap((block) => [...block.internalRoutes.keys()]),
  );
  const graph = await elk.layout<ElkNode>({
    id: "factory",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1",
      "elk.padding": "[top=48,left=48,bottom=48,right=48]",
      "elk.spacing.nodeNode": "64",
      "elk.spacing.edgeNode": "32",
      "elk.spacing.edgeEdge": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "128",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "28",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.mergeEdges": "false",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "128",
    },
    children: blocks.map((column) => ({
      id: column.id,
      width: column.width,
      height: column.height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: column.members.flatMap(({ node, offsetY }) =>
        materialPortGeometry(node)
          .filter(
            ({ port }) =>
              !column.boundaryPorts ||
              column.boundaryPorts.has(portKey(node.configuration.id, port.id)),
          )
          .map(({ port, point, side }) => ({
            id: portKey(node.configuration.id, port.id),
            x: side === "left" ? 0 : column.width,
            y:
              column.boundaryPorts?.get(portKey(node.configuration.id, port.id))
                ?.y ?? offsetY + point.y - node.y,
            width: 0,
            height: 0,
            layoutOptions: {
              "elk.port.side": side === "left" ? "WEST" : "EAST",
            },
          })),
      ),
    })),
    edges: document.materialLinks
      .filter((link) => !internalLinks.has(link.id))
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((link) => ({
        id: link.id,
        sources: [portKey(link.from.nodeId, link.from.portId)],
        targets: [portKey(link.to.nodeId, link.to.portId)],
      })),
  });
  const placedBlocks = new Map(graph.children?.map((node) => [node.id, node]));
  const positions = new Map(
    blocks.flatMap((column) => {
      const position = placedBlocks.get(column.id);
      if (
        !position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)
      )
        throw new Error("Could not position every node.");
      return column.members.map(
        ({ node, offsetX, offsetY }) =>
          [
            node.configuration.id,
            {
              x: position.x! + offsetX,
              y: position.y! + offsetY,
            },
          ] as const,
      );
    }),
  );
  const routes = new Map<string, ConnectionRoute>(
    graph.edges?.map((edge) => {
      const section = edge.sections?.[0];
      if (!section || edge.sections?.length !== 1)
        throw new Error("Could not route every connection.");
      return [
        edge.id,
        [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
      ] as const;
    }),
  );
  const portRoutes = new Map<string, ConnectionRoute>();
  for (const block of balancers) {
    const position = placedBlocks.get(block.id)!;
    const translate = (route: ConnectionRoute) =>
      route.map((point) => ({
        x: point.x + position.x!,
        y: point.y + position.y!,
      }));
    for (const [id, route] of block.internalRoutes)
      routes.set(id, translate(route));
    for (const [id, route] of block.portRoutes)
      portRoutes.set(id, translate(route));
  }
  const nodes = document.nodes.map((node) => ({
    ...node,
    ...positions.get(node.configuration.id)!,
  }));
  const ports = new Map(
    nodes.flatMap((node) =>
      materialPortGeometry(node).map(
        ({ port, point }) =>
          [portKey(node.configuration.id, port.id), point] as const,
      ),
    ),
  );
  return {
    ...document,
    nodes,
    materialLinks: document.materialLinks.map(
      ({ routeMode: _routeMode, ...link }) => {
        const route = routes.get(link.id);
        const from = ports.get(portKey(link.from.nodeId, link.from.portId));
        const to = ports.get(portKey(link.to.nodeId, link.to.portId));
        if (!route || !from || !to)
          throw new Error("Could not route every connection.");
        // Join local tree routes to the path between blocks. For recipe columns,
        // the extra horizontal stub also accommodates narrower cards.
        return {
          ...link,
          route: simplifyRoute([
            ...(portRoutes.get(portKey(link.from.nodeId, link.from.portId)) ?? [
              from,
            ]),
            ...route,
            ...(portRoutes
              .get(portKey(link.to.nodeId, link.to.portId))
              ?.toReversed() ?? [to]),
          ]),
        };
      },
    ),
  };
}
