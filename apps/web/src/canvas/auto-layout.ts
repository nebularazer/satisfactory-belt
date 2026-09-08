import type { ELK, ElkNode } from "elkjs/lib/elk-api";
import type { CanvasDocument, CanvasNode } from "./document";
import { materialPortGeometry } from "./material-port-geometry";
import { simplifyRoute } from "./orthogonal-router";

const portKey = (nodeId: string, portId: string) =>
  JSON.stringify([nodeId, portId]);

const STACK_GAP = 64;

function recipeColumns(document: CanvasDocument) {
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
      return { node, offsetY };
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
  // Give ELK one obstacle per recipe column, with every machine's real ports.
  // Routing happens around the complete stack, before it is expanded back into
  // individual cards, so alignment cannot invalidate the calculated belt paths.
  const columns = recipeColumns(document);
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
    children: columns.map((column) => ({
      id: column.id,
      width: column.width,
      height: column.height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: column.members.flatMap(({ node, offsetY }) =>
        materialPortGeometry(node).map(({ port, point, side }) => ({
          id: portKey(node.configuration.id, port.id),
          x: side === "left" ? 0 : column.width,
          y: offsetY + point.y - node.y,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": side === "left" ? "WEST" : "EAST" },
        })),
      ),
    })),
    edges: document.materialLinks
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((link) => ({
        id: link.id,
        sources: [portKey(link.from.nodeId, link.from.portId)],
        targets: [portKey(link.to.nodeId, link.to.portId)],
      })),
  });
  const placedColumns = new Map(graph.children?.map((node) => [node.id, node]));
  const positions = new Map(
    columns.flatMap((column) => {
      const position = placedColumns.get(column.id);
      if (
        !position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)
      )
        throw new Error("Could not position every node.");
      return column.members.map(
        ({ node, offsetY }) =>
          [
            node.configuration.id,
            {
              x: position.x!,
              y: position.y! + offsetY,
            },
          ] as const,
      );
    }),
  );
  const routes = new Map(
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
        // Narrower cards end inside the column's boundary. Extend the horizontal
        // port stub through that empty space to attach it to the actual card.
        return { ...link, route: simplifyRoute([from, ...route, to]) };
      },
    ),
  };
}
