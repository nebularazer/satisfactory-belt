import { PREFERRED_LINE_GAP, snapLane, ceilLane } from "./route-spacing";
import { groupBounds } from "./group-bounds";
import { routeFeedback } from "./feedback-routing";
import {
  routeBetweenGroups,
  spaceLayoutRoutes,
  layoutRouteScore,
} from "./layout-routing";
import { spaceRouterPorts } from "./router-port-spacing";
import type { ELK, ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import type {
  CanvasDocument,
  CanvasNode,
  CanvasMaterialLink,
} from "./document";
import type { Point } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";
import { simplifyRoute } from "./orthogonal-router";
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
  "elk.spacing.edgeEdge": String(PREFERRED_LINE_GAP),
  "elk.layered.spacing.nodeNodeBetweenLayers": "128",
  "elk.layered.spacing.edgeNodeBetweenLayers": "40",
  "elk.layered.spacing.edgeEdgeBetweenLayers": String(PREFERRED_LINE_GAP),
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
  return { x: snapLane(node.x!), y: snapLane(node.y!) };
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
  laneGap: number,
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
      "elk.spacing.edgeEdge": String(laneGap),
      "elk.layered.spacing.edgeEdgeBetweenLayers": String(laneGap),
      "elk.spacing.nodeNode": String(64 + laneGap - PREFERRED_LINE_GAP),
      "elk.partitioning.activate": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        128 + feedback.length * laneGap + (laneGap - PREFERRED_LINE_GAP) * 2,
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
    const result = {
      ...node,
      x: returnX,
      y: ceilLane((graph.height ?? 0) + 80),
    };
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
  routeFeedback(placed, links, feedback, structure.returnNodes, routes);
  spaceLayoutRoutes(
    placed,
    links.filter(
      (link) => members.has(link.from.nodeId) && members.has(link.to.nodeId),
    ),
    routes,
  );
  // Reserve internal belts and symmetric padding, including local return lanes.
  const bounds = groupBounds(placed, [...routes.values()]);
  // Guides influence local alignment only. Reserve the visible contents, not
  // empty space left by a full-height neighboring stack or another group.
  const shift = { x: ceilLane(-bounds.x), y: ceilLane(-bounds.y) };
  for (const node of placed) {
    node.x += shift.x;
    node.y += shift.y;
  }
  for (const [id, route] of routes) routes.set(id, translate(route, shift));
  const width = ceilLane(bounds.x + bounds.width + shift.x);
  const height = ceilLane(bounds.y + bounds.height + shift.y);
  const block: Block = {
    id: key("logistics", ids[0]!),
    width,
    height,
    nodes: placed,
    ports: [],
    routes,
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
  topology: "aggregate" | "physical",
): Promise<CanvasDocument> {
  if (!document.nodes.length) return document;
  // If a crowded corridor cannot be repaired locally, reserve more space and
  // recompute the layout. Never quietly accept a sub-grid parallel run.
  for (const multiplier of [1, 2, 4, 8]) {
    const result = await arrangeAtSpacing(
      document,
      elk,
      PREFERRED_LINE_GAP * multiplier,
      topology,
    );
    const routes = new Map(
      result.materialLinks.map((link) => [link.id, link.route!]),
    );
    if (
      result.materialLinks.every(
        (link) =>
          layoutRouteScore(
            link,
            link.route!,
            result.materialLinks,
            routes,
          )[4]! < 0.01,
      )
    )
      return result;
  }
  throw new Error("Could not find a layout with enough space between links.");
}

async function arrangeAtSpacing(
  document: CanvasDocument,
  elk: Pick<ELK, "layout">,
  laneGap: number,
  topology: "aggregate" | "physical",
): Promise<CanvasDocument> {
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
    };
  });
  // Destination groups are laid out first, so upstream shared distribution
  // can use their actual port heights as guides. Unplaced routers get small
  // individual guides rather than the old, combined logistics rectangle.
  const neighbors = new Map<string, Block>(
    sorted.nodes
      .filter((node) => node.configuration.kind === "router")
      .map((node) => [
        node.configuration.id,
        {
          id: key("guide-router", node.configuration.id),
          nodes: [{ ...node, x: 0, y: 0 }],
          width: node.width,
          height: node.height,
          ports: [],
          routes: new Map(),
        } as Block,
      ]),
  );
  for (const block of blocks)
    for (const node of block.nodes) neighbors.set(node.configuration.id, block);
  const groups = productionStructure(sorted).logistics;
  const groupOwner = new Map(
    groups.flatMap((ids) => ids.map((id) => [id, ids[0]!] as const)),
  );
  const groupSteps = graphStages(
    groups.map((ids) => ids[0]!),
    sorted.materialLinks
      .filter(
        (link) =>
          groupOwner.has(link.from.nodeId) &&
          groupOwner.has(link.to.nodeId) &&
          groupOwner.get(link.from.nodeId) !== groupOwner.get(link.to.nodeId),
      )
      .map((link) => ({
        from: groupOwner.get(link.from.nodeId)!,
        to: groupOwner.get(link.to.nodeId)!,
      })),
  );
  for (const group of groups.toSorted(
    (a, b) => groupSteps.get(b[0]!)! - groupSteps.get(a[0]!)!,
  )) {
    const block = await logisticsBlock(sorted, group, elk, neighbors, laneGap);
    blocks.push(block);
    for (const node of block.nodes) neighbors.set(node.configuration.id, block);
  }
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
  const blockEdges = external.map((link) => ({
    from: owners.get(link.from.nodeId)!.id,
    to: owners.get(link.to.nodeId)!.id,
  }));
  // Extra distribution groups must not stagger parallel production recipes.
  // Find recipe stages through logistics, then share their coarse layout rank.
  const recipeEdges: { from: string; to: string }[] = [];
  for (const from of recipes.keys()) {
    const visited = new Set<string>();
    const queue = blockEdges
      .filter((edge) => edge.from === from)
      .map((edge) => edge.to);
    for (let i = 0; i < queue.length; i++) {
      const to = queue[i]!;
      if (visited.has(to)) continue;
      visited.add(to);
      if (recipes.has(to)) recipeEdges.push({ from, to });
      else
        queue.push(
          ...blockEdges
            .filter((edge) => edge.from === to)
            .map((edge) => edge.to),
        );
    }
  }
  const recipeStages = graphStages([...recipes.keys()], recipeEdges);
  const sameStage = Map.groupBy([...recipeStages], ([, stage]) => stage);
  const alignmentEdges = [...sameStage.values()].flatMap((siblings) =>
    siblings.slice(1).flatMap(([id]) => [
      { from: siblings[0]![0], to: id },
      { from: id, to: siblings[0]![0] },
    ]),
  );
  const stages = graphStages(
    blocks.map((block) => block.id),
    [...blockEdges, ...alignmentEdges],
  );
  // Keep simpler destination groups close to their consumers even when other
  // branches need an extra shared-distribution stage before their balancer.
  for (const block of blocks.toSorted(
    (a, b) => stages.get(b.id)! - stages.get(a.id)!,
  )) {
    if (recipes.has(block.id)) continue;
    const children = blockEdges.filter((edge) => edge.from === block.id);
    if (children.length)
      stages.set(
        block.id,
        Math.max(
          stages.get(block.id)!,
          Math.min(...children.map((edge) => stages.get(edge.to)! - 1)),
        ),
      );
  }
  const graph = await elk.layout<ElkNode>({
    id: "factory",
    layoutOptions: {
      ...options,
      "elk.partitioning.activate": "true",
      "elk.spacing.nodeNode": String(128 + laneGap - PREFERRED_LINE_GAP),
      "elk.spacing.edgeEdge": String(laneGap),
      "elk.layered.spacing.edgeEdgeBetweenLayers": String(laneGap),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        128 + (laneGap - PREFERRED_LINE_GAP) * 2,
      ),
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
          // Coarse lanes are only routing hints. Route between actual ports
          // once, after all groups are placed, instead of routing local tails
          // that would immediately be discarded by the corridor pass.
          route: simplifyRoute([from, ...route, to]),
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
      const members = new Set(nodes.map((node) => node.configuration.id));
      const internal = block.routes.size
        ? arranged.materialLinks
            .filter(
              (link) =>
                members.has(link.from.nodeId) && members.has(link.to.nodeId),
            )
            .map((link) => link.route!)
        : [];
      return {
        id: block.id,
        ...groupBounds(nodes, internal),
        nodeIds: nodes.map((node) => node.configuration.id),
      };
    }),
    new Map(arranged.materialLinks.map((link) => [link.id, link.route!])),
    topology,
  );
  return {
    ...arranged,
    materialLinks: arranged.materialLinks.map((link) => ({
      ...link,
      route: routed.get(link.id)!,
    })),
  };
}
