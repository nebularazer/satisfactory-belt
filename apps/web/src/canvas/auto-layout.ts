import { spaceRouterPorts } from "./router-port-spacing";
import type { ELK, ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import type {
  CanvasDocument,
  CanvasNode,
  CanvasMaterialLink,
} from "./document";
import type { Point } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";
import { routeOrthogonally, simplifyRoute } from "./orthogonal-router";
import { graphStages } from "./graph-stages";
import { productionStructure } from "./production-structure";

const key = (...parts: string[]) => JSON.stringify(parts);
const STACK_GAP = 64;
const options = {
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
};
type Block = {
  id: string;
  groupId: string;
  width: number;
  height: number;
  nodes: CanvasNode[];
  ports: NonNullable<ElkNode["ports"]>;
};
const endpointKey = (link: CanvasMaterialLink, end: "from" | "to") =>
  key(link.id, end);
function points(edge: ElkExtendedEdge): Point[] {
  const section = edge.sections?.[0];
  if (!section || edge.sections?.length !== 1)
    throw new Error("Could not route every connection.");
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}

/** Recipe stacks are fixed-port blocks; routers remain individual layout nodes.
 * Group bounds never act as obstacles or funnel belts through boundary ports. */
export async function arrangeCanvas(
  document: CanvasDocument,
  elk: Pick<ELK, "layout">,
): Promise<CanvasDocument> {
  if (!document.nodes.length) return document;
  const sorted: CanvasDocument = {
    ...document,
    nodes: spaceRouterPorts(document).nodes.toSorted((a, b) =>
      a.configuration.id.localeCompare(b.configuration.id, "en", {
        numeric: true,
      }),
    ),
    materialLinks: document.materialLinks.toSorted((a, b) =>
      a.id.localeCompare(b.id),
    ),
  };
  const structure = productionStructure(sorted);
  const logisticsOwners = new Map(
    structure.logistics.flatMap((ids) =>
      ids.map((id) => [id, key("logistics", ids[0]!)] as const),
    ),
  );
  const groups = new Map<string, CanvasNode[]>();
  for (const node of sorted.nodes) {
    if (structure.returnNodes.has(node.configuration.id)) continue;
    const id =
      node.configuration.kind === "router"
        ? key("router", node.configuration.id)
        : key(
            "recipe",
            node.configuration.kind === "process"
              ? node.configuration.processId
              : node.configuration.id,
          );
    const members = groups.get(id) ?? [];
    members.push(node);
    groups.set(id, members);
  }
  const blocks: Block[] = [...groups].map(([id, members]) => {
    let y = 0;
    const nodes = members.map((node) => {
      const member = { ...node, x: 0, y };
      y += node.height + STACK_GAP;
      return member;
    });
    return {
      id,
      groupId: logisticsOwners.get(members[0]!.configuration.id) ?? id,
      nodes,
      width: Math.max(...nodes.map((node) => node.width)),
      height: y - STACK_GAP,
      ports: [],
    };
  });
  const owners = new Map(
    blocks.flatMap((block) =>
      block.nodes.map((node) => [node.configuration.id, block] as const),
    ),
  );
  const feedback = sorted.materialLinks.filter(
    (link) =>
      structure.feedbackLinks.has(link.id) &&
      logisticsOwners.has(link.from.nodeId) &&
      logisticsOwners.get(link.from.nodeId) ===
        logisticsOwners.get(link.to.nodeId),
  );
  const feedbackIds = new Set(feedback.map((link) => link.id));
  const forward = sorted.materialLinks.filter(
    (link) => !feedbackIds.has(link.id),
  );
  for (const link of forward)
    for (const end of ["from", "to"] as const) {
      const block = owners.get(link[end].nodeId)!;
      const node = block.nodes.find(
        (node) => node.configuration.id === link[end].nodeId,
      )!;
      const p = materialPortGeometry(node).find(
        (p) => p.port.id === link[end].portId,
      )!;
      block.ports.push({
        id: endpointKey(link, end),
        x: p.side === "left" ? 0 : block.width,
        y: p.point.y,
        width: 0,
        height: 0,
        layoutOptions: { "elk.port.side": p.side === "left" ? "WEST" : "EAST" },
      });
    }
  // Reserve enough layers for each stage's logistics, keeping parallel recipes
  // in the same stage even when their balancers have different depths.
  const coarse = graphStages(
    [...new Set(blocks.map((block) => block.groupId))],
    forward
      .map((link) => ({
        from: owners.get(link.from.nodeId)!.groupId,
        to: owners.get(link.to.nodeId)!.groupId,
      }))
      .filter((edge) => edge.from !== edge.to),
  );
  const depths = graphStages(
    blocks.map((block) => block.id),
    forward
      .filter(
        (link) =>
          owners.get(link.from.nodeId)!.groupId ===
          owners.get(link.to.nodeId)!.groupId,
      )
      .map((link) => ({
        from: owners.get(link.from.nodeId)!.id,
        to: owners.get(link.to.nodeId)!.id,
      })),
  );
  const stageWidths = new Map<number, number>();
  for (const block of blocks) {
    const stage = coarse.get(block.groupId)!;
    stageWidths.set(
      stage,
      Math.max(stageWidths.get(stage) ?? 1, depths.get(block.id)! + 1),
    );
  }
  const stages = new Map<number, number>();
  let offset = 0;
  for (const [stage, width] of [...stageWidths].sort(([a], [b]) => a - b)) {
    stages.set(stage, offset);
    offset += width;
  }
  const graph = await elk.layout<ElkNode>({
    id: "factory",
    layoutOptions: { ...options, "elk.partitioning.activate": "true" },
    children: blocks.map((block) => ({
      id: block.id,
      width: block.width,
      height: block.height,
      ports: block.ports,
      layoutOptions: {
        "elk.portConstraints": "FIXED_POS",
        "elk.partitioning.partition": String(
          stages.get(coarse.get(block.groupId)!)! + depths.get(block.id)!,
        ),
      },
    })),
    edges: forward.map((link) => ({
      id: link.id,
      sources: [endpointKey(link, "from")],
      targets: [endpointKey(link, "to")],
    })),
  });
  const placed = new Map<string, CanvasNode>();
  for (const block of blocks) {
    const position = graph.children?.find((child) => child.id === block.id);
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    )
      throw new Error("Could not position every node.");
    for (const node of block.nodes)
      placed.set(node.configuration.id, {
        ...node,
        x: node.x + position.x!,
        y: node.y + position.y!,
      });
  }
  const routes = new Map<string, readonly Point[]>(
    graph.edges?.map((edge) => [edge.id, points(edge)]),
  );
  for (const ids of structure.logistics) {
    const members = new Set(ids);
    const nodes = [...placed.values()].filter((node) =>
      members.has(node.configuration.id),
    );
    const returns = sorted.nodes.filter(
      (node) =>
        members.has(node.configuration.id) &&
        structure.returnNodes.has(node.configuration.id),
    );
    if (!nodes.length) continue;
    const left = Math.min(...nodes.map((node) => node.x));
    const right = Math.max(...nodes.map((node) => node.x + node.width));
    let bottom =
      Math.max(
        ...[...placed.values()]
          .filter((node) => node.x < right && node.x + node.width > left)
          .map((node) => node.y + node.height),
      ) + 80;
    for (const node of returns) {
      placed.set(node.configuration.id, { ...node, x: left, y: bottom });
      bottom += node.height + STACK_GAP;
    }
  }
  const ports = new Map(
    [...placed.values()].flatMap((node) =>
      materialPortGeometry(node).map(
        (p) => [key(node.configuration.id, p.port.id), p] as const,
      ),
    ),
  );
  const obstacles = [...placed.values()].map((node) => ({
    ...node,
    id: node.configuration.id,
  }));
  for (const ids of structure.logistics) {
    const members = new Set(ids);
    const links = feedback.filter((link) => members.has(link.from.nodeId));
    const nodes = [...placed.values()].filter((node) =>
      members.has(node.configuration.id),
    );
    const bottom = Math.max(...nodes.map((node) => node.y + node.height));
    links.forEach((link, index) => {
      const from = ports.get(key(link.from.nodeId, link.from.portId))!;
      const to = ports.get(key(link.to.nodeId, link.to.portId))!;
      const y = bottom + 64 + index * 28;
      const laneOffset = 32 + index * 20;
      const fromX =
        from.point.x + (from.side === "left" ? -laneOffset : laneOffset);
      const toX = to.point.x + (to.side === "left" ? -laneOffset : laneOffset);
      const rejoin =
        structure.returnNodes.has(from.nodeId) &&
        !structure.returnNodes.has(to.nodeId) &&
        from.side === "right" &&
        to.side === "left" &&
        to.point.x > from.point.x;
      const siblings = links
        .filter((edge) => edge.from.nodeId === from.nodeId)
        .toSorted(
          (a, b) =>
            ports.get(key(a.from.nodeId, a.from.portId))!.point.y -
              ports.get(key(b.from.nodeId, b.from.portId))!.point.y ||
            a.id.localeCompare(b.id),
        );
      const rejoinX =
        to.point.x -
        32 -
        (siblings.length -
          1 -
          siblings.findIndex((edge) => edge.id === link.id)) *
          20;
      routes.set(
        link.id,
        routeOrthogonally(
          from,
          to,
          obstacles,
          rejoin
            ? [
                { x: rejoinX, y: from.point.y },
                { x: rejoinX, y: to.point.y },
              ]
            : [
                { x: fromX, y: from.point.y },
                { x: fromX, y },
                { x: toX, y },
                { x: toX, y: to.point.y },
              ],
        ),
      );
    });
  }
  return {
    ...document,
    nodes: document.nodes.map((node) => placed.get(node.configuration.id)!),
    materialLinks: document.materialLinks.map(
      ({ routeMode: _routeMode, ...link }) => {
        const from = ports.get(key(link.from.nodeId, link.from.portId))!.point;
        const to = ports.get(key(link.to.nodeId, link.to.portId))!.point;
        const route = routes.get(link.id);
        if (!route) throw new Error("Could not route every connection.");
        return { ...link, route: simplifyRoute([from, ...route, to]) };
      },
    ),
  };
}
