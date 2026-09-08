import { expect, it } from "vitest";
import { routeFeedback } from "./feedback-routing";
import { testCanvasNode } from "./test-fixtures";
import { materialPortGeometry } from "./material-port-geometry";
import { routeIsClear } from "./orthogonal-router";
import type { CanvasMaterialLink } from "./document";
import type { Point } from "./geometry";
import { groupBounds, GROUP_PADDING } from "./group-bounds";

it("keeps a return local even when unrelated branches extend far below it", () => {
  const nodes = [
    testCanvasNode("input", 0, 0),
    testCanvasNode("branch", 600, 200),
    testCanvasNode("unrelated", 300, 3000),
  ];
  const link: CanvasMaterialLink = {
    id: "return",
    from: { nodeId: "branch", portId: "output:3" },
    to: { nodeId: "input", portId: "input:1" },
  };
  const route = (members: typeof nodes) => {
    const routes = new Map<string, readonly Point[]>();
    routeFeedback(members, [link], [link], new Set(), routes);
    return routes.get(link.id)!;
  };
  const result = route(nodes);
  expect(result).toEqual(route(nodes.slice(0, 2)));
  expect(Math.max(...result.map((point) => point.y))).toBeLessThan(400);
  for (const [end, point] of [
    [link.from, result[0]!],
    [link.to, result.at(-1)!],
  ] as const) {
    expect(point).toEqual(
      nodes
        .flatMap(materialPortGeometry)
        .find((p) => p.nodeId === end.nodeId && p.port.id === end.portId)!
        .point,
    );
  }
  expect(
    routeIsClear(
      result,
      nodes.map((node) => ({ ...node, id: node.configuration.id })),
    ),
  ).toBe(true);
});

it("includes internal return lanes with the same padding on all four sides", () => {
  const nodes = [testCanvasNode("a", 100, 100), testCanvasNode("b", 600, 100)];
  const route = [
    { x: 776, y: 160 },
    { x: 808, y: 160 },
    { x: 808, y: 250 },
    { x: 68, y: 250 },
    { x: 68, y: 140 },
    { x: 100, y: 140 },
  ];
  const bounds = groupBounds(nodes, [route]);
  expect(bounds).toEqual({
    x: 68 - GROUP_PADDING,
    y: 100 - GROUP_PADDING,
    width: 740 + GROUP_PADDING * 2,
    height: 150 + GROUP_PADDING * 2,
  });
});
