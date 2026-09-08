import type { CanvasMaterialLink, CanvasNode } from "./document";
import type { Point } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";
import { routeIsClear, routeOrthogonally } from "./orthogonal-router";
import { layoutRouteScore } from "./layout-routing";

/** Prefer nearby returns, with a modest cost for bends and crossings. Never
 * force an independent loop below all the unrelated routers in its group.
 */
export function routeFeedback(
  nodes: readonly CanvasNode[],
  links: readonly CanvasMaterialLink[],
  feedback: readonly CanvasMaterialLink[],
  returnNodes: ReadonlySet<string>,
  routes: Map<string, readonly Point[]>,
) {
  const ports = nodes.flatMap(materialPortGeometry);
  const endpoint = (end: CanvasMaterialLink["from"]) =>
    ports.find((p) => p.nodeId === end.nodeId && p.port.id === end.portId)!;
  const obstacles = nodes.map((node) => ({
    ...node,
    id: node.configuration.id,
  }));
  for (const [index, link] of feedback.entries()) {
    const from = endpoint(link.from),
      to = endpoint(link.to);
    const siblings = feedback
      .filter((edge) => edge.from.nodeId === from.nodeId)
      .toSorted(
        (a, b) =>
          endpoint(a.from).point.y - endpoint(b.from).point.y ||
          a.id.localeCompare(b.id),
      );
    const rejoin =
      returnNodes.has(from.nodeId) &&
      !returnNodes.has(to.nodeId) &&
      from.side === "right" &&
      to.side === "left" &&
      to.point.x > from.point.x;
    const rejoinX =
      to.point.x -
      32 -
      (siblings.length -
        1 -
        siblings.findIndex((edge) => edge.id === link.id)) *
        20;
    if (rejoin) {
      routes.set(
        link.id,
        routeOrthogonally(from, to, obstacles, [
          { x: rejoinX, y: from.point.y },
          { x: rejoinX, y: to.point.y },
        ]),
      );
      continue;
    }
    const ends = nodes.filter(
      (node) =>
        node.configuration.id === from.nodeId ||
        node.configuration.id === to.nodeId,
    );
    const offset = 32 + index * 20;
    const fromX = from.point.x + (from.side === "left" ? -offset : offset);
    const toX = to.point.x + (to.side === "left" ? -offset : offset);
    const candidates = [
      routeOrthogonally(from, to, obstacles),
      ...[
        Math.min(...ends.map((node) => node.y)) - offset,
        Math.max(...ends.map((node) => node.y + node.height)) + offset,
      ].map((y) =>
        routeOrthogonally(from, to, obstacles, [
          { x: fromX, y: from.point.y },
          { x: fromX, y },
          { x: toX, y },
          { x: toX, y: to.point.y },
        ]),
      ),
    ].filter((route) => routeIsClear(route, obstacles, from.nodeId, to.nodeId));
    const score = (route: readonly Point[]) => {
      const [overlap, crossings, bends, length] = layoutRouteScore(
        link,
        route,
        links,
        routes,
      );
      return [overlap!, length! + crossings! * 48 + bends! * 32];
    };
    candidates.sort((a, b) => {
      const aa = score(a),
        bb = score(b);
      return aa[0]! - bb[0]! || aa[1]! - bb[1]!;
    });
    if (!candidates[0])
      throw new Error("Could not route a feedback connection.");
    routes.set(link.id, candidates[0]);
  }
}
