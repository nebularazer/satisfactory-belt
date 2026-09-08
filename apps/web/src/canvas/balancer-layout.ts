import type {
  CanvasDocument,
  CanvasNode,
  CanvasMaterialLink,
} from "./document";
import type { ConnectionRoute } from "./connection-route";
import type { Point } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";
import { routeOrthogonally } from "./orthogonal-router";

export const layoutPortKey = (nodeId: string, portId: string) =>
  JSON.stringify([nodeId, portId]);

export type LayoutBlock = {
  id: string;
  width: number;
  height: number;
  members: { node: CanvasNode; offsetX: number; offsetY: number }[];
  boundaryPorts?: Map<string, Point>;
  portRoutes?: Map<string, ConnectionRoute>;
  internalRoutes?: Map<string, ConnectionRoute>;
};

function direction(node: CanvasNode) {
  if (node.configuration.kind !== "router") return undefined;
  if (node.configuration.buildableId === "Build_ConveyorAttachmentSplitter_C")
    return "split";
  if (node.configuration.buildableId === "Build_ConveyorAttachmentMerger_C")
    return "merge";
  return undefined;
}

/** Recognizes physical splitter/merger trees from connectivity, never generated IDs. */
export function balancerLayoutBlocks(
  document: CanvasDocument,
): Required<LayoutBlock>[] {
  const nodes = new Map(
    document.nodes.map((node) => [node.configuration.id, node]),
  );
  const routers = document.nodes
    .filter((node) => direction(node))
    .toSorted((a, b) => a.configuration.id.localeCompare(b.configuration.id));
  const fanEdges = new Map<string, CanvasMaterialLink[]>();
  const parents = new Map<string, string[]>();
  const neighbours = new Map<string, string[]>();
  for (const link of document.materialLinks) {
    for (const endpoint of [link.from, link.to]) {
      const node = nodes.get(endpoint.nodeId)!;
      const kind = direction(node);
      if (
        !kind ||
        (kind === "split" ? endpoint !== link.from : endpoint !== link.to)
      )
        continue;
      const list = fanEdges.get(endpoint.nodeId) ?? [];
      list.push(link);
      fanEdges.set(endpoint.nodeId, list);
    }
    if (
      !direction(nodes.get(link.from.nodeId)!) ||
      direction(nodes.get(link.from.nodeId)!) !==
        direction(nodes.get(link.to.nodeId)!)
    )
      continue;
    const [parent, child] =
      direction(nodes.get(link.from.nodeId)!) === "split"
        ? [link.from.nodeId, link.to.nodeId]
        : [link.to.nodeId, link.from.nodeId];
    parents.set(child, [...(parents.get(child) ?? []), parent]);
    neighbours.set(parent, [...(neighbours.get(parent) ?? []), child]);
    neighbours.set(child, [...(neighbours.get(child) ?? []), parent]);
  }
  const visited = new Set<string>();
  const blocks: Required<LayoutBlock>[] = [];
  for (const router of routers) {
    const id = router.configuration.id;
    if (visited.has(id)) continue;
    const component = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const next = pending.pop()!;
      if (component.has(next)) continue;
      component.add(next);
      visited.add(next);
      pending.push(...(neighbours.get(next) ?? []));
    }
    const roots = [...component].filter((key) => !parents.has(key));
    // Cyclic or reconverging same-kind networks keep the general ELK layout.
    if (
      component.size < 2 ||
      roots.length !== 1 ||
      [...component].some((key) => (parents.get(key)?.length ?? 0) > 1)
    )
      continue;
    const block = layoutTree(
      roots[0]!,
      component,
      nodes,
      fanEdges,
      document.materialLinks,
      direction(router) === "split",
    );
    if (block) blocks.push(block);
  }
  return blocks;
}

// Subtrees receive disjoint vertical bands. Each parent sits at the centre of
// its descendants, while depth determines the column; fan-in mirrors fan-out.
function layoutTree(
  root: string,
  component: Set<string>,
  nodes: Map<string, CanvasNode>,
  fanEdges: Map<string, CanvasMaterialLink[]>,
  links: CanvasDocument["materialLinks"],
  split: boolean,
): Required<LayoutBlock> | undefined {
  const fanEndpoint = (link: CanvasMaterialLink) =>
    split ? link.from : link.to;
  const childEndpoint = (link: CanvasMaterialLink) =>
    split ? link.to : link.from;
  if (
    [...component].some((key) => {
      const links = fanEdges.get(key) ?? [];
      return (
        new Set(links.map((link) => fanEndpoint(link).portId)).size !==
        links.length
      );
    })
  )
    return undefined;
  const ports = new Map(
    [...component].map((key) => [key, materialPortGeometry(nodes.get(key)!)]),
  );
  const branches = new Map(
    [...component].map((key) => [
      key,
      (fanEdges.get(key) ?? []).toSorted((a, b) => {
        const y = (link: CanvasMaterialLink) =>
          ports
            .get(key)!
            .find(({ port }) => port.id === fanEndpoint(link).portId)!.point.y;
        return y(a) - y(b);
      }),
    ]),
  );
  const spans = new Map<string, number>();
  const widths: number[] = [];
  const measure = (key: string, depth: number): number => {
    widths[depth] = Math.max(widths[depth] ?? 0, nodes.get(key)!.width);
    const span = Math.max(
      1,
      branches.get(key)!.reduce((total, link) => {
        const child = childEndpoint(link).nodeId;
        return total + (component.has(child) ? measure(child, depth + 1) : 1);
      }, 0),
    );
    spans.set(key, span);
    return span;
  };
  const leafCount = measure(root, 0);
  const leafNodes = [...branches.values()]
    .flat()
    .map((link) => childEndpoint(link).nodeId)
    .filter((id) => !component.has(id))
    .map((id) => nodes.get(id)!);
  const recipes = new Set(
    leafNodes.map(({ configuration }) =>
      configuration.kind === "process" ? configuration.processId : undefined,
    ),
  );
  // Match the spacing of a single recipe column; mixed destinations and return
  // networks use compact router spacing instead of reserving machine-sized gaps.
  const alignedLeaves =
    recipes.size === 1 && !recipes.has(undefined) ? leafNodes : [];
  const pitch = Math.max(
    ...[...component].map((key) => nodes.get(key)!.height + 64),
    ...alignedLeaves.map((node) => node.height + 64),
  );
  const width = widths.reduce((sum, size) => sum + size + 128, 0);
  const block: Required<LayoutBlock> = {
    id: JSON.stringify(["balancer", root]),
    width,
    height: leafCount * pitch,
    members: [],
    boundaryPorts: new Map(),
    portRoutes: new Map(),
    internalRoutes: new Map(),
  };
  const place = (key: string, depth: number, start: number) => {
    const node = nodes.get(key)!;
    const x =
      64 + widths.slice(0, depth).reduce((sum, size) => sum + size + 128, 0);
    block.members.push({
      node,
      offsetX: split ? x : width - x - node.width,
      offsetY: (start + spans.get(key)! / 2) * pitch - node.height / 2,
    });
    let cursor = start;
    for (const link of branches.get(key)!) {
      const child = childEndpoint(link).nodeId;
      if (component.has(child)) {
        place(child, depth + 1, cursor);
        cursor += spans.get(child)!;
      } else {
        block.boundaryPorts.set(layoutPortKey(key, fanEndpoint(link).portId), {
          x: split ? width : 0,
          y: (cursor + 0.5) * pitch,
        });
        cursor++;
      }
    }
  };
  place(root, 0, 0);
  const localNodes = block.members.map(({ node, offsetX, offsetY }) => ({
    ...node,
    x: offsetX,
    y: offsetY,
  }));
  const localPorts = new Map(
    localNodes.flatMap((node) =>
      materialPortGeometry(node).map(
        (port) => [layoutPortKey(port.nodeId, port.port.id), port] as const,
      ),
    ),
  );
  const obstacles = localNodes.map((node) => ({
    ...node,
    id: node.configuration.id,
  }));
  for (const link of links) {
    const from = localPorts.get(
      layoutPortKey(link.from.nodeId, link.from.portId),
    );
    const to = localPorts.get(layoutPortKey(link.to.nodeId, link.to.portId));
    if (from && to) {
      block.internalRoutes.set(link.id, routeOrthogonally(from, to, obstacles));
    } else {
      const port = from ?? to;
      if (!port) continue;
      const key = layoutPortKey(port.nodeId, port.port.id);
      const boundary = block.boundaryPorts.get(key) ?? {
        x: port.side === "left" ? 0 : width,
        y: port.point.y,
      };
      block.boundaryPorts.set(key, boundary);
      block.portRoutes.set(
        key,
        routeOrthogonally(
          port,
          { point: boundary, side: port.side === "left" ? "right" : "left" },
          obstacles,
        ),
      );
    }
  }
  return block;
}
