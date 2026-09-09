import { expect, it } from "vitest";
import { layoutRouteScore, spaceLayoutRoutes } from "./layout-routing";
import {
  moveRouteLane,
  parallelGap,
  runSegment,
  snapRoute,
} from "./route-spacing";
import { materialPortGeometry } from "./material-port-geometry";
import { routeIsClear } from "./orthogonal-router";
import { testCanvasNode } from "./test-fixtures";
import type { CanvasMaterialLink } from "./document";
import type { Point } from "./geometry";

it.each([false, true])(
  "separates close parallel runs on the grid (return: %s)",
  (returning) => {
    const nodes = [
      testCanvasNode("a", 0, 0),
      testCanvasNode("b", 0, 160),
      testCanvasNode("c", 700, 320),
      testCanvasNode("d", 700, 480),
    ];
    const links: CanvasMaterialLink[] = [
      ["a", "c"],
      ["b", "d"],
    ].map(([left, right], i) => ({
      id: String(i),
      from: { nodeId: (returning ? right : left)!, portId: "output:1" },
      to: { nodeId: (returning ? left : right)!, portId: "input:1" },
    }));
    const ports = nodes.flatMap(materialPortGeometry);
    const endpoint = (end: CanvasMaterialLink["from"]) =>
      ports.find(
        (port) => port.nodeId === end.nodeId && port.port.id === end.portId,
      )!.point;
    const routes = new Map<string, readonly Point[]>(
      links.map((link, i) => {
        const from = endpoint(link.from),
          to = endpoint(link.to);
        return [
          link.id,
          returning
            ? [
                from,
                { x: 960 + i * 4, y: from.y },
                { x: 960 + i * 4, y: 720 + i * 4 },
                { x: -64 - i * 4, y: 720 + i * 4 },
                { x: -64 - i * 4, y: to.y },
                to,
              ]
            : [
                from,
                { x: 400 + i * 4, y: from.y },
                { x: 400 + i * 4, y: to.y },
                to,
              ],
        ];
      }),
    );
    const original = new Map(routes);
    spaceLayoutRoutes(nodes, links, routes);
    for (const link of links) {
      const route = routes.get(link.id)!;
      expect(route[0]).toEqual(endpoint(link.from));
      expect(route.at(-1)).toEqual(endpoint(link.to));
      expect(layoutRouteScore(link, route, links, routes).slice(4)).toEqual([
        0, 0,
      ]);
      expect(
        routeIsClear(
          route,
          nodes.map((node) => ({ ...node, id: node.configuration.id })),
        ),
      ).toBe(true);
      for (const point of route.slice(1, -1)) {
        expect(Math.abs(point.x % 16)).toBe(0);
        expect(Math.abs(point.y % 16)).toBe(0);
      }
    }
    const reordered = new Map(original);
    spaceLayoutRoutes(nodes.toReversed(), links.toReversed(), reordered);
    expect(reordered).toEqual(routes);
  },
);

it("keeps the fixed port exception local instead of exempting a whole shared run", () => {
  const link: CanvasMaterialLink = {
    id: "a",
    from: { nodeId: "source", portId: "out" },
    to: { nodeId: "a", portId: "in" },
  };
  const other = { ...link, id: "b", to: { nodeId: "b", portId: "in" } };
  const route = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ];
  const score = layoutRouteScore(
    link,
    route,
    [link, other],
    new Map([[other.id, route]]),
  );
  expect(score[4]).toBe(136);
  const segment = runSegment(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    1,
  );
  expect(
    parallelGap(segment.a, segment.b, { x: 0, y: 4 }, { x: 20, y: 4 }).length,
  ).toBe(0);
});

it("retains off-grid port endpoints while shifting a long horizontal run", () => {
  const from = { x: 3, y: 7 },
    to = { x: 501, y: 7 };
  const snapped = snapRoute([from, to], from, to);
  const shifted = moveRouteLane(snapped, 1, 32);
  expect(shifted[0]).toEqual(from);
  expect(shifted.at(-1)).toEqual(to);
  expect(shifted).toContainEqual({ x: 35, y: 32 });
  expect(shifted).toContainEqual({ x: 469, y: 32 });
});
