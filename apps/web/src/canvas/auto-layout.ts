import { routeBetweenGroups } from "./layout-routing";
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
  width: number;
  height: number;
  nodes: CanvasNode[];
  ports: NonNullable<ElkNode["ports"]>;
  routes: Map<string, readonly Point[]>;
  tails: Map<string, Point[]>;
};
const endpointKey = (link: CanvasMaterialLink, end: "from" | "to") =>
  key(link.id, end);
function port(id: string, point: Point, side: "left" | "right") {
  return {
    id,
    ...point,
    width: 0,
    height: 0,
    layoutOptions: { "elk.port.side": side === "left" ? "WEST" : "EAST" },
  };
}
function points(edge: ElkExtendedEdge): Point[] {
  const section = edge.sections?.[0];
  if (!section || edge.sections?.length !== 1)
    throw new Error("Could not route every connection.");
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}
const translate = (route: readonly Point[], offset: Point) =>
  route.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
function nodeGraph(node: CanvasNode): ElkNode {
  return {
    id: node.configuration.id,
    width: node.width,
    height: node.height,
    layoutOptions: { "elk.portConstraints": "FIXED_POS" },
    ports: materialPortGeometry(node).map(({ port: p, point, side }) =>
      port(
        key(node.configuration.id, p.id),
        { x: point.x - node.x, y: point.y - node.y },
        side,
      ),
    ),
  };
}
function position(graph: ElkNode, id: string): Point {
  const node = graph.children?.find((child) => child.id === id);
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y))
    throw new Error("Could not position every node.");
  return { x: node.x!, y: node.y! };
}

/** Lay out a physical logistics network independently of its production stages.
 * Full-size neighboring recipe stacks provide port-height constraints. Group
 * exits stay level with the actual router ports; they are never compact buses.
 */
async function logisticsBlock(
  document: CanvasDocument,
  ids: string[],
  elk: Pick<ELK, "layout">,
  neighbors: ReadonlyMap<string, Block>,
): Promise<Block> {
  const members = new Set(ids);
  const structure = productionStructure(document);
  const nodes = document.nodes.filter((node) =>
    members.has(node.configuration.id),
  );
  const links = document.materialLinks.filter(
    (link) => members.has(link.from.nodeId) || members.has(link.to.nodeId),
  );
  const feedback = links.filter(
    (link) =>
      structure.feedbackLinks.has(link.id) &&
      members.has(link.from.nodeId) &&
      members.has(link.to.nodeId),
  );
  const inputs = links.filter((link) => !members.has(link.from.nodeId));
  const outputs = links.filter((link) => !members.has(link.to.nodeId));
  const forwardNodes = nodes.filter(
    (node) => !structure.returnNodes.has(node.configuration.id),
  );
  const steps = graphStages(
    forwardNodes.map((node) => node.configuration.id),
    links
      .filter(
        (link) =>
          members.has(link.from.nodeId) &&
          members.has(link.to.nodeId) &&
          !structure.feedbackLinks.has(link.id),
      )
      .map((link) => ({ from: link.from.nodeId, to: link.to.nodeId })),
  );
  const lastStep = Math.max(0, ...steps.values()) + 2;
  // Keep all the space and real port heights of each connected recipe stack.
  // These guides constrain ordering and spacing, but never become routing exits.
  const boundary = (
    edges: CanvasMaterialLink[],
    end: "from" | "to",
  ): ElkNode[] =>
    [...Map.groupBy(edges, (link) => neighbors.get(link[end].nodeId)!)].map(
      ([neighbor, edges]) => ({
        id: key("guide", end, neighbor.id),
        width: 0,
        height: neighbor.height,
        layoutOptions: {
          "elk.portConstraints": "FIXED_POS",
          "elk.partitioning.partition": String(end === "from" ? 0 : lastStep),
        },
        ports: edges.map((link) => {
          const node = neighbor.nodes.find(
            (node) => node.configuration.id === link[end].nodeId,
          )!;
          const p = materialPortGeometry(node).find(
            (p) => p.port.id === link[end].portId,
          )!;
          return port(
            endpointKey(link, end),
            { x: 0, y: p.point.y },
            end === "from" ? "right" : "left",
          );
        }),
      }),
    );
  const graph = await elk.layout<ElkNode>({
    id: "logistics",
    layoutOptions: {
      ...options,
      "elk.partitioning.activate": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        128 + feedback.length * 20,
      ),
    },
    children: [
      ...forwardNodes.map((node) => {
        const child = nodeGraph(node);
        return {
          ...child,
          layoutOptions: {
            ...child.layoutOptions,
            "elk.partitioning.partition": String(
              steps.get(node.configuration.id)! + 1,
            ),
          },
        };
      }),
      ...boundary(inputs, "from"),
      ...boundary(outputs, "to"),
    ],
    edges: links
      .filter(
        (link) =>
          !(
            structure.feedbackLinks.has(link.id) &&
            members.has(link.from.nodeId) &&
            members.has(link.to.nodeId)
          ),
      )
      .map((link) => ({
        id: link.id,
        sources: [
          members.has(link.from.nodeId)
            ? key(link.from.nodeId, link.from.portId)
            : endpointKey(link, "from"),
        ],
        targets: [
          members.has(link.to.nodeId)
            ? key(link.to.nodeId, link.to.portId)
            : endpointKey(link, "to"),
        ],
      })),
  });
  let returnX = 96;
  const placed = nodes.map((node) => {
    if (!structure.returnNodes.has(node.configuration.id))
      return { ...node, ...position(graph, node.configuration.id) };
    const result = { ...node, x: returnX, y: (graph.height ?? 0) + 80 };
    returnX += node.width + 96;
    return result;
  });
  const routes = new Map<string, readonly Point[]>(
    graph.edges
      ?.filter((edge) => {
        const link = links.find((link) => link.id === edge.id)!;
        return members.has(link.from.nodeId) && members.has(link.to.nodeId);
      })
      .map((edge) => [edge.id, points(edge)]),
  );
  const ports = new Map(
    placed.flatMap((node) =>
      materialPortGeometry(node).map(
        (p) => [key(node.configuration.id, p.port.id), p] as const,
      ),
    ),
  );
  const bottom = Math.max(...placed.map((node) => node.y + node.height));
  const obstacles = placed.map((node) => ({
    ...node,
    id: node.configuration.id,
  }));
  feedback.forEach((link, index) => {
    const from = ports.get(key(link.from.nodeId, link.from.portId))!;
    const to = ports.get(key(link.to.nodeId, link.to.portId))!;
    const y = bottom + 64 + index * 28;
    const laneOffset = 32 + index * 20;
    const fromX =
      from.point.x + (from.side === "left" ? -laneOffset : laneOffset);
    const toX = to.point.x + (to.side === "left" ? -laneOffset : laneOffset);
    // Return distributors already sit below the forward network. Their outgoing
    // feeds travel directly across at their port heights, then rise to rejoin.
    // Only the belt arriving back at the distributor needs the outside lane.
    const rejoin =
      structure.returnNodes.has(from.nodeId) &&
      !structure.returnNodes.has(to.nodeId) &&
      from.side === "right" &&
      to.side === "left" &&
      to.point.x > from.point.x;
    const siblings = feedback
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
        { point: from.point, side: from.side, nodeId: from.nodeId },
        { point: to.point, side: to.side, nodeId: to.nodeId },
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
  // Reserve any leftward return detour inside the logistics obstacle as well.
  const shiftX = Math.max(
    0,
    48 -
      Math.min(
        ...[...routes.values()].flat().map((point) => point.x),
        ...placed.map((node) => node.x),
      ),
  );
  if (shiftX) {
    for (const node of placed) node.x += shiftX;
    for (const [id, route] of routes)
      routes.set(id, translate(route, { x: shiftX, y: 0 }));
  }
  const width = Math.max(
    graph.width ?? 0,
    returnX,
    ...[...routes.values()].flat().map((point) => point.x + 48),
  );
  const height = Math.max(
    graph.height ?? 0,
    ...placed.map((node) => node.y + node.height + 48),
    ...[...routes.values()].flat().map((point) => point.y + 48),
  );
  const block: Block = {
    id: key("logistics", ids[0]!),
    width,
    height,
    nodes: placed,
    ports: [],
    routes,
    tails: new Map(),
  };
  for (const [edges, end] of [
    [inputs, "from"],
    [outputs, "to"],
  ] as const) {
    for (const link of edges) {
      const entering = end === "from";
      const endpoint = entering ? link.to : link.from;
      const node = placed.find(
        (node) => node.configuration.id === endpoint.nodeId,
      )!;
      const actual = materialPortGeometry(node).find(
        (p) => p.port.id === endpoint.portId,
      )!;
      const point = { x: entering ? 0 : width, y: actual.point.y };
      block.ports.push(
        port(
          endpointKey(link, entering ? "to" : "from"),
          point,
          entering ? "left" : "right",
        ),
      );
      const boundary = {
        point,
        side: entering ? ("right" as const) : ("left" as const),
      };
      const obstacles = placed.map((node) => ({
        ...node,
        id: node.configuration.id,
      }));
      block.tails.set(
        link.id,
        entering
          ? [...routeOrthogonally(boundary, actual, obstacles)]
          : [...routeOrthogonally(actual, boundary, obstacles)],
      );
    }
  }
  // No artificial boundary nodes are returned to the editor.
  return block;
}

/** Computes presentation only. Topology and machine port order stay intact;
 * two-way belt routers place their unused slot in the middle. */
export async function arrangeCanvas(
  document: CanvasDocument,
  elk: Pick<ELK, "layout">,
): Promise<CanvasDocument> {
  if (!document.nodes.length) return document;
  // Stable model order makes repeated arrangements independent of canvas positions.
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
  const recipes = new Map<string, CanvasNode[]>();
  for (const node of sorted.nodes) {
    if (node.configuration.kind === "router") continue;
    const id = key(
      "recipe",
      node.configuration.kind === "process"
        ? node.configuration.processId
        : node.configuration.id,
    );
    const group = recipes.get(id) ?? [];
    group.push(node);
    recipes.set(id, group);
  }
  const blocks: Block[] = [...recipes].map(([id, members]) => {
    let y = 0;
    const nodes = members.map((node) => {
      const member = { ...node, x: 0, y };
      y += node.height + STACK_GAP;
      return member;
    });
    return {
      id,
      nodes,
      width: Math.max(...nodes.map((node) => node.width)),
      height: y - STACK_GAP,
      ports: [],
      routes: new Map(),
      tails: new Map(),
    };
  });
  const recipeOwners = new Map(
    blocks.flatMap((block) =>
      block.nodes.map((node) => [node.configuration.id, block] as const),
    ),
  );
  for (const group of productionStructure(sorted).logistics)
    blocks.push(await logisticsBlock(sorted, group, elk, recipeOwners));
  const owners = new Map(
    blocks.flatMap((block) =>
      block.nodes.map((node) => [node.configuration.id, block] as const),
    ),
  );
  const external = sorted.materialLinks.filter(
    (link) => owners.get(link.from.nodeId) !== owners.get(link.to.nodeId),
  );
  for (const link of sorted.materialLinks)
    for (const end of ["from", "to"] as const) {
      const block = owners.get(link[end].nodeId)!;
      if (block.ports.some((port) => port.id === endpointKey(link, end)))
        continue;
      const node = block.nodes.find(
        (node) => node.configuration.id === link[end].nodeId,
      )!;
      if (node.configuration.kind === "router") continue;
      const p = materialPortGeometry(node).find(
        (p) => p.port.id === link[end].portId,
      )!;
      block.ports.push(
        port(
          endpointKey(link, end),
          { x: p.side === "left" ? 0 : block.width, y: p.point.y },
          p.side,
        ),
      );
    }
  // Same-recipe connections stay visible as self-loops around the recipe column.
  const recipeInternal = sorted.materialLinks.filter(
    (link) =>
      owners.get(link.from.nodeId) === owners.get(link.to.nodeId) &&
      !owners.get(link.from.nodeId)!.routes.has(link.id),
  );
  const globalLinks = [...external, ...recipeInternal];
  const stages = graphStages(
    blocks.map((block) => block.id),
    external.map((link) => ({
      from: owners.get(link.from.nodeId)!.id,
      to: owners.get(link.to.nodeId)!.id,
    })),
  );
  const graph = await elk.layout<ElkNode>({
    id: "factory",
    layoutOptions: {
      ...options,
      "elk.partitioning.activate": "true",
      "elk.spacing.nodeNode": "128",
    },
    children: blocks.map((block) => ({
      id: block.id,
      width: block.width,
      height: block.height,
      ports: block.ports,
      layoutOptions: {
        "elk.portConstraints": "FIXED_POS",
        "elk.partitioning.partition": String(stages.get(block.id)),
      },
    })),
    edges: globalLinks.map((link) => ({
      id: link.id,
      sources: [endpointKey(link, "from")],
      targets: [endpointKey(link, "to")],
    })),
  });
  const placed = new Map(
    blocks.flatMap((block) => {
      const offset = position(graph, block.id);
      return block.nodes.map(
        (node) =>
          [
            node.configuration.id,
            { ...node, x: node.x + offset.x, y: node.y + offset.y },
          ] as const,
      );
    }),
  );
  const routes = new Map<string, readonly Point[]>(
    graph.edges?.map((edge) => [edge.id, points(edge)]),
  );
  for (const block of blocks)
    for (const [id, route] of block.routes)
      routes.set(id, translate(route, position(graph, block.id)));
  const arranged: CanvasDocument = {
    ...document,
    nodes: document.nodes.map((node) => placed.get(node.configuration.id)!),
    materialLinks: document.materialLinks.map(
      ({ routeMode: _routeMode, ...link }) => {
        const fromBlock = owners.get(link.from.nodeId)!;
        const toBlock = owners.get(link.to.nodeId)!;
        const from = materialPortGeometry(placed.get(link.from.nodeId)!).find(
          (p) => p.port.id === link.from.portId,
        )!.point;
        const to = materialPortGeometry(placed.get(link.to.nodeId)!).find(
          (p) => p.port.id === link.to.portId,
        )!.point;
        const route = routes.get(link.id);
        if (!route) throw new Error("Could not route every connection.");
        return {
          ...link,
          route: simplifyRoute([
            from,
            ...translate(
              fromBlock.tails.get(link.id) ?? [],
              position(graph, fromBlock.id),
            ),
            ...route,
            ...translate(
              toBlock.tails.get(link.id) ?? [],
              position(graph, toBlock.id),
            ),
            to,
          ]),
        };
      },
    ),
  };
  const routed = routeBetweenGroups(
    arranged,
    blocks.map((block) => {
      const nodes = block.nodes.map((node) =>
        placed.get(node.configuration.id)!,
      );
      const x = Math.min(...nodes.map((node) => node.x)) - 20;
      const y = Math.min(...nodes.map((node) => node.y)) - 56;
      return {
        id: block.id,
        x,
        y,
        width: Math.max(...nodes.map((node) => node.x + node.width)) - x + 20,
        height: Math.max(...nodes.map((node) => node.y + node.height)) - y + 20,
        nodeIds: nodes.map((node) => node.configuration.id),
      };
    }),
    new Map(arranged.materialLinks.map((link) => [link.id, link.route!])),
  );
  return {
    ...arranged,
    materialLinks: arranged.materialLinks.map((link) => ({
      ...link,
      route: routed.get(link.id)!,
    })),
  };
}
