import { expect, it } from "vitest";

import type { Point } from "./geometry";
import { hitTestLinks, linkHandles, routeLink, segmentGuides, translateGuides } from "./links";
import type { CanvasLink } from "./links";
function orthogonal(points: readonly Point[]) {
  for (let i = 1; i < points.length; i++)
    expect(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y).toBe(true);
}
const source = { x: 100, y: 100 },
  target = { x: 500, y: 260 };
const output = { nodeId: "a", portKey: "output" },
  input = { nodeId: "b", portKey: "input" };
it.each([{ x: 500, y: 100 }, target, { x: 0, y: 100 }, { x: 0, y: 20 }])(
  "routes attached orthogonal endpoints to %j",
  (end) => {
    const points = routeLink(source, end);
    orthogonal(points);
    expect(points[0]).toEqual(source);
    expect(points.at(-1)).toEqual(end);
    expect(points[1].x).toBeGreaterThan(source.x);
    expect(points.at(-2)!.x).toBeLessThan(end.x);
    expect(linkHandles({ id: "l", output, input, points }).length).toBeGreaterThan(0);
  },
);
it("keeps the default route independent of card bounds", () => {
  const obstacles = [{ x: 240, y: 40, width: 120, height: 180 }];
  expect(routeLink(source, { x: 500, y: 100 }, obstacles)).toEqual(
    routeLink(source, { x: 500, y: 100 }),
  );
});
it("moves a straight link's interior segment and retains its constraint when an endpoint moves", () => {
  const points = routeLink(source, { x: 500, y: 100 });
  const guides = segmentGuides(points, 1, 160);
  const adjusted = routeLink(source, { x: 500, y: 100 }, [], guides);
  orthogonal(adjusted);
  expect(adjusted.some((p, i) => p.y === 160 && adjusted[i + 1]?.y === 160)).toBe(true);
  const moved = routeLink({ x: 120, y: 120 }, { x: 500, y: 100 }, [], guides);
  expect(moved[0]).toEqual({ x: 120, y: 120 });
  expect(moved.some((p) => p.y === 160)).toBe(true);
  expect(translateGuides(guides, { x: 32, y: 48 })).toEqual([{ axis: "y", position: 208 }]);
});
it("hits offscreen links and selects the topmost line on exact ties", () => {
  const points = routeLink({ x: -400, y: 40 }, { x: 1600, y: 40 });
  const a: CanvasLink = { id: "a", output, input, points },
    b = { ...a, id: "b" };
  expect(
    hitTestLinks({ x: 200, y: 40 }, false, { x: 0, y: 0, zoom: 1 }, [a, b], null).map(
      (hit) => hit.id,
    ),
  ).toEqual(["b"]);
  expect(hitTestLinks({ x: 200, y: 60 }, true, { x: 0, y: 0, zoom: 1 }, [a], null)).toHaveLength(1);
  expect(hitTestLinks({ x: 200, y: 60 }, false, { x: 0, y: 0, zoom: 1 }, [a], null)).toHaveLength(
    0,
  );
});

it("keeps outward endpoint stubs when a manual vertical segment moves past either node", () => {
  const points = routeLink(source, target);
  const link = { id: "l", output, input, points };
  const vertical = linkHandles(link).find((handle) => handle.axis === "x")!;
  for (const position of [-100, 800]) {
    const adjusted = routeLink(
      source,
      target,
      [],
      segmentGuides(points, vertical.segment, position),
    );
    orthogonal(adjusted);
    expect(adjusted[1].x).toBeGreaterThan(source.x);
    expect(adjusted.at(-2)!.x).toBeLessThan(target.x);
    expect(adjusted.some((p, i) => p.x === position && adjusted[i + 1]?.x === position)).toBe(true);
  }
});

it.each([16, 32, 48])(
  "keeps short %s-unit connections direct and editable between adjacent nodes",
  (gap) => {
    const start = { x: 256, y: 128 },
      end = { x: 256 + gap, y: 128 };
    const points = routeLink(start, end, [
      { x: 0, y: 0, width: 256, height: 256 },
      { x: end.x, y: 0, width: 256, height: 256 },
    ]);
    expect(points.every((point) => point.y === 128)).toBe(true);
    expect(points[1].x).toBeLessThan(points[2].x);
    expect(linkHandles({ id: "short", output, input, points })).toHaveLength(1);
  },
);

it("retains all three editable segments after moving the center handle repeatedly", () => {
  let points = routeLink(source, target);
  expect(linkHandles({ id: "link", output, input, points })).toHaveLength(3);
  for (const x of [320, 280, 360, 300]) {
    const handle = linkHandles({ id: "link", output, input, points }).find((h) => h.axis === "x")!;
    points = routeLink(source, target, [], segmentGuides(points, handle.segment, x));
    orthogonal(points);
    expect(linkHandles({ id: "link", output, input, points })).toHaveLength(3);
  }
});

it.each([0.5, 1, 2])(
  "selects the nearest line at zoom %s even when a farther link is selected",
  (zoom) => {
    const a: CanvasLink = {
      id: "a",
      output,
      input,
      points: [
        { x: 0, y: 40 },
        { x: 200, y: 40 },
      ],
    };
    const b = {
      ...a,
      id: "b",
      points: [
        { x: 0, y: 48 },
        { x: 200, y: 48 },
      ],
    };
    const camera = { x: 30, y: 20, zoom };
    expect(
      hitTestLinks({ x: 30 + 100 * zoom, y: 20 + 43 * zoom }, true, camera, [a, b], "b"),
    ).toEqual([{ id: "a", segment: 0 }]);
    expect(
      hitTestLinks({ x: 30 + 100 * zoom, y: 20 + 44 * zoom }, true, camera, [a, b], "a"),
    ).toEqual([{ id: "a", segment: 0 }]);
  },
);

it("selects the nearest segment of a folded link, including zero-length segments", () => {
  const link: CanvasLink = {
    id: "folded",
    output,
    input,
    points: [
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 48 },
      { x: 100, y: 48 },
      { x: 0, y: 48 },
    ],
  };
  expect(hitTestLinks({ x: 50, y: 47 }, true, { x: 0, y: 0, zoom: 1 }, [link], null)).toEqual([
    { id: "folded", segment: 3 },
  ]);
});

it("selects the nearest route handle when touch targets overlap", () => {
  const link: CanvasLink = {
    id: "short",
    output,
    input,
    points: [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 16 },
      { x: 56, y: 16 },
      { x: 80, y: 16 },
    ],
  };
  expect(
    hitTestLinks({ x: 47, y: 15 }, true, { x: 0, y: 0, zoom: 1 }, [link], link.id, true),
  ).toEqual([{ id: "short", segment: 3 }]);
});

it("keeps automatic bends independent of the canvas grid", () => {
  const start = { x: 101, y: 103 },
    end = { x: 509, y: 261 };
  const points = routeLink(start, end);
  expect(points[0]).toEqual(start);
  expect(points.at(-1)).toEqual(end);
  orthogonal(points);
  expect(points.some((p) => p.x % 16 !== 0 || p.y % 16 !== 0)).toBe(true);
});

it("ignores narrow gaps between cards", () => {
  const start = { x: 0, y: 120 },
    end = { x: 560, y: 280 },
    obstacles = [
      { x: 160, y: 0, width: 96, height: 224 },
      { x: 280, y: 160, width: 96, height: 224 },
    ];
  expect(routeLink(start, end, obstacles)).toEqual(routeLink(start, end));
});

it("retains manual guides", () => {
  const points = routeLink(source, target, [], [{ axis: "x", position: 333 }]);
  expect(points.some((p) => p.x === 333)).toBe(true);
  orthogonal(points);
});
