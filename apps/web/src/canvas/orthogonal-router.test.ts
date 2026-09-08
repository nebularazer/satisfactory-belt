import { describe, expect, it } from "vitest";
import {
  routeIsClear,
  routeOrthogonally,
  type RouteEndpoint,
} from "./orthogonal-router";

const from: RouteEndpoint = {
  point: { x: 100, y: 80 },
  side: "right",
  nodeId: "source",
};
const to: RouteEndpoint = {
  point: { x: 700, y: 180 },
  side: "left",
  nodeId: "target",
};
const nodes = [
  { id: "source", x: 0, y: 0, width: 100, height: 160 },
  { id: "target", x: 700, y: 100, width: 100, height: 160 },
  { id: "wall", x: 240, y: -100, width: 160, height: 400 },
  { id: "lower", x: 420, y: 200, width: 200, height: 180 },
];

describe("Fixed-position connection routing", () => {
  it("routes around intervening cards without moving nodes", () => {
    const before = structuredClone(nodes);
    const route = routeOrthogonally(from, to, nodes);
    expect(route[0]).toEqual(from.point);
    expect(route.at(-1)).toEqual(to.point);
    expect(routeIsClear(route, nodes, "source", "target")).toBe(true);
    expect(route.some(({ y }) => y <= -116 || y >= 316)).toBe(true);
    expect(nodes).toEqual(before);
    expect(routeOrthogonally(from, to, nodes)).toEqual(route);
  });

  it("respects port sides on reverse connections and pipe ports on the same side", () => {
    for (const side of ["right", "left"] as const) {
      const source: RouteEndpoint = {
        point: { x: 800, y: 180 },
        side: "right",
        nodeId: "target",
      };
      const target: RouteEndpoint = {
        point: { x: side === "right" ? 100 : 0, y: 80 },
        side,
        nodeId: "source",
      };
      const route = routeOrthogonally(source, target, nodes);
      expect(routeIsClear(route, nodes, source.nodeId, target.nodeId)).toBe(
        true,
      );
      expect(route[1]!.x).toBeGreaterThan(source.point.x);
      expect(route.at(-2)!.x * (side === "left" ? -1 : 1)).toBeGreaterThan(
        target.point.x * (side === "left" ? -1 : 1),
      );
    }
  });

  it("preserves manual waypoints and routes between them", () => {
    const via = [
      { x: 150, y: -180 },
      { x: 650, y: -180 },
    ];
    const route = routeOrthogonally(from, to, nodes, via);
    expect(routeIsClear(route, nodes, "source", "target")).toBe(true);
    for (const point of via)
      expect(
        route.slice(1).some((to, index) => {
          const from = route[index]!;
          return (
            (from.y === point.y &&
              to.y === point.y &&
              point.x >= Math.min(from.x, to.x) &&
              point.x <= Math.max(from.x, to.x)) ||
            (from.x === point.x &&
              to.x === point.x &&
              point.y >= Math.min(from.y, to.y) &&
              point.y <= Math.max(from.y, to.y))
          );
        }),
      ).toBe(true);
  });

  it("keeps previews attached when the cursor is over a card", () => {
    const cursor: RouteEndpoint = { point: { x: 300, y: 150 }, side: "left" };
    const route = routeOrthogonally(from, cursor, nodes);
    expect(route[0]).toEqual(from.point);
    expect(route.at(-1)).toEqual(cursor.point);
    expect(
      routeIsClear(
        route,
        nodes.filter(({ id }) => id !== "wall"),
        "source",
      ),
    ).toBe(true);
  });
});
