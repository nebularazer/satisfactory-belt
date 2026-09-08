import type { ELK, ElkNode } from "elkjs/lib/elk-api";
import type { CanvasDocument } from "./document";
import { materialPortGeometry } from "./material-port-geometry";

const portKey = (nodeId: string, portId: string) =>
  JSON.stringify([nodeId, portId]);

/** Computes presentation only. Node identities, port order and topology stay intact. */
export async function arrangeCanvas(
  document: CanvasDocument,
  elk: Pick<ELK, "layout">,
): Promise<CanvasDocument> {
  if (!document.nodes.length) return document;
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
    children: document.nodes
      .toSorted((a, b) => a.configuration.id.localeCompare(b.configuration.id))
      .map((node) => ({
        id: node.configuration.id,
        width: node.width,
        height: node.height,
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: materialPortGeometry(node).map(({ port, point, side }) => ({
          id: portKey(node.configuration.id, port.id),
          x: point.x - node.x,
          y: point.y - node.y,
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": side === "left" ? "WEST" : "EAST" },
        })),
      })),
    edges: document.materialLinks
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((link) => ({
        id: link.id,
        sources: [portKey(link.from.nodeId, link.from.portId)],
        targets: [portKey(link.to.nodeId, link.to.portId)],
      })),
  });
  const positions = new Map(graph.children?.map((node) => [node.id, node]));
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
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const position = positions.get(node.configuration.id);
      if (
        !position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)
      )
        throw new Error("Could not position every node.");
      return { ...node, x: position.x!, y: position.y! };
    }),
    materialLinks: document.materialLinks.map(
      ({ routeMode: _routeMode, ...link }) => ({
        ...link,
        route: routes.get(link.id),
      }),
    ),
  };
}
