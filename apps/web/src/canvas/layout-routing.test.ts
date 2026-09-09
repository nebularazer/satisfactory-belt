import { expect, it } from "vitest";
import { EMPTY_CANVAS_DOCUMENT, type CanvasMaterialLink } from "./document";
import { testCanvasNode } from "./test-fixtures";
import { materialPortGeometry } from "./material-port-geometry";
import { layoutRouteScore, routeBetweenGroups } from "./layout-routing";
import { routeIsClear } from "./orthogonal-router";

const link = (id: string, from: string, to: string): CanvasMaterialLink => ({
  id,
  from: { nodeId: from, portId: "output:1" },
  to: { nodeId: to, portId: "input:1" },
});
it("distinguishes shared port departures from overlapping independent belts and crossings", () => {
  const a = link("a", "source", "a");
  const b = link("b", "other", "b");
  const route = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const overlap = new Map([
    [
      "b",
      [
        { x: 40, y: 0 },
        { x: 140, y: 0 },
      ],
    ],
  ]);
  expect(layoutRouteScore(a, route, [a, b], overlap).slice(0, 2)).toEqual([
    60, 0,
  ]);
  const crossing = new Map([
    [
      "b",
      [
        { x: 50, y: -50 },
        { x: 50, y: 50 },
      ],
    ],
  ]);
  expect(layoutRouteScore(a, route, [a, b], crossing).slice(0, 2)).toEqual([
    0, 1,
  ]);
  const shared = link("b", "source", "b");
  expect(
    layoutRouteScore(a, route, [a, shared], new Map([["b", route]])).slice(
      0,
      2,
    ),
  ).toEqual([0, 0]);
});

it("gives independent feeds distinct lanes while preserving their endpoints", () => {
  const nodes = [
    testCanvasNode("a", 0, 0),
    testCanvasNode("b", 0, 160),
    testCanvasNode("c", 700, 320),
    testCanvasNode("d", 700, 480),
  ];
  const links = [link("ac", "a", "c"), link("bd", "b", "d")];
  const point = (nodeId: string, portId: string) =>
    materialPortGeometry(
      nodes.find((node) => node.configuration.id === nodeId)!,
    ).find((p) => p.port.id === portId)!.point;
  const seeds = new Map(
    links.map((link, i) => {
      const from = point(link.from.nodeId, link.from.portId),
        to = point(link.to.nodeId, link.to.portId);
      const x = 400 + i * 28;
      return [link.id, [from, { x, y: from.y }, { x, y: to.y }, to]] as const;
    }),
  );
  const groups = [
    { id: "supply", x: 0, y: 0, width: 176, height: 256, nodeIds: ["a", "b"] },
    {
      id: "consumers",
      x: 700,
      y: 320,
      width: 176,
      height: 256,
      nodeIds: ["c", "d"],
    },
  ];
  const document = { ...EMPTY_CANVAS_DOCUMENT, nodes, materialLinks: links };
  const result = routeBetweenGroups(document, groups, seeds);
  for (const link of links) {
    expect(result.get(link.id)![0]).toEqual(
      point(link.from.nodeId, link.from.portId),
    );
    expect(result.get(link.id)!.at(-1)).toEqual(
      point(link.to.nodeId, link.to.portId),
    );
    expect(
      layoutRouteScore(link, result.get(link.id)!, links, result).slice(0, 2),
    ).toEqual([0, 0]);
  }
  expect(routeBetweenGroups(document, groups, seeds)).toEqual(result);
  expect(
    routeBetweenGroups(
      {
        ...document,
        materialLinks: links.toReversed(),
        nodes: nodes.toReversed(),
      },
      groups,
      seeds,
    ),
  ).toEqual(result);
});

it("keeps bypass belts outside unrelated group interiors", () => {
  const nodes = [testCanvasNode("a", 0, 0), testCanvasNode("b", 900, 0)];
  const edge = link("ab", "a", "b");
  const groups = nodes.map((node) => ({
    ...node,
    id: node.configuration.id,
    nodeIds: [node.configuration.id],
  }));
  const obstacle = {
    id: "other group",
    nodeIds: [],
    x: 350,
    y: -100,
    width: 200,
    height: 400,
  };
  const from = materialPortGeometry(nodes[0]!).find(
    (p) => p.port.id === edge.from.portId,
  )!.point;
  const to = materialPortGeometry(nodes[1]!).find(
    (p) => p.port.id === edge.to.portId,
  )!.point;
  const result = routeBetweenGroups(
    { ...EMPTY_CANVAS_DOCUMENT, nodes, materialLinks: [edge] },
    [...groups, obstacle],
    new Map([
      [edge.id, [from, { x: 600, y: from.y }, { x: 600, y: to.y }, to]],
    ]),
  );
  expect(routeIsClear(result.get(edge.id)!, [obstacle])).toBe(true);
});

it("routes Basic links around visible cards without enforcing group boundaries", () => {
  const nodes = [
    testCanvasNode("a", 0, 0),
    testCanvasNode("b", 900, 0),
    testCanvasNode("blocker", 400, 0),
  ];
  const edge = link("ab", "a", "b");
  const from = materialPortGeometry(nodes[0]!).find(
    (p) => p.port.id === edge.from.portId,
  )!.point;
  const to = materialPortGeometry(nodes[1]!).find(
    (p) => p.port.id === edge.to.portId,
  )!.point;
  // Both endpoints share a recipe block; Basic still routes their connection.
  const groups = [
    {
      id: "recipe",
      x: -100,
      y: -100,
      width: 1200,
      height: 400,
      nodeIds: ["a", "b", "blocker"],
    },
  ];
  const result = routeBetweenGroups(
    { ...EMPTY_CANVAS_DOCUMENT, nodes, materialLinks: [edge] },
    groups,
    new Map([[edge.id, [from, to]]]),
    "aggregate",
  ).get(edge.id)!;
  expect(result).not.toEqual([from, to]);
  expect(result[0]).toEqual(from);
  expect(result.at(-1)).toEqual(to);
  expect(
    routeIsClear(
      result,
      nodes.map((node) => ({ ...node, id: node.configuration.id })),
    ),
  ).toBe(true);
});
