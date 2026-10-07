import { buildDistribution } from "@satisfactory-belt/factory-core";
import type { ElkNode } from "elkjs/lib/elk-api";
import ELK from "elkjs/lib/elk.bundled.js";
import { expect, it, vi } from "vitest";

import { distributionFixture } from "../test/distribution-fixture";
import { distributionRequest, distributionScene, distributionSnapshot } from "./distribution";

function buildScene(
  snapshot: Parameters<typeof distributionScene>[0],
  assets: Parameters<typeof distributionScene>[1],
  tier: number,
) {
  const input = distributionRequest(snapshot, tier);
  const graph =
    "nodes" in input
      ? input
      : buildDistribution(input.sources, input.destinations, input.maxTier, input.transport);
  return distributionScene(snapshot, assets, graph);
}

vi.mock("./distribution-layout", () => ({
  layoutDistribution: (graph: ElkNode) => new ELK().layout(graph),
}));

it.each(["nodes", "machines"] as const)(
  "lays %s main flow left to right and return belts back",
  async (detail) => {
    const { editor, assets, port } = distributionFixture();
    const scene = buildScene(distributionSnapshot(editor, assets, port, detail), assets, 4);
    await scene.layout(new AbortController().signal);
    const { items: bounds, links } = scene.controller.getSnapshot();
    const items = new Map(bounds.map((item) => [item.id, item]));
    for (const node of scene.graph.nodes) {
      if (node.kind !== "splitter" && node.kind !== "merger") continue;
      const ports = scene.getDisplay(node.id)!.ports;
      expect(new Set(ports.map((connector) => `${connector.x}:${connector.y}`)).size).toBe(
        ports.length,
      );
      for (const connector of ports) {
        expect(connector.x).toBe(connector.direction === "input" ? 0 : 128);
        expect([32, 64, 96]).toContain(connector.y);
      }
    }
    expect(scene.graph.edges.some((edge) => edge.feedback)).toBe(true);
    for (const edge of scene.graph.edges) {
      const source = items.get(edge.from)!;
      const destination = items.get(edge.to)!;
      if (edge.feedback) expect(destination.x + destination.width).toBeLessThanOrEqual(source.x);
      else
        expect(destination.x, `${edge.from} → ${edge.to}`).toBeGreaterThanOrEqual(
          source.x + source.width,
        );
    }
    expect(links).toHaveLength(scene.graph.edges.length);
    for (const link of links) {
      for (const [ref, point] of [
        [link.output, link.points[0]],
        [link.input, link.points.at(-1)],
      ] as const) {
        const item = items.get(ref.nodeId)!;
        const connector = scene
          .getDisplay(ref.nodeId)!
          .ports.find((entry) => entry.key === ref.portKey)!;
        expect(point).toEqual({ x: item.x + connector.x, y: item.y + connector.y });
      }
      link.points.slice(1).forEach((point, index) => {
        const previous = link.points[index]!;
        expect(point.x === previous.x || point.y === previous.y).toBe(true);
      });
    }
    if (detail === "nodes") {
      // This example previously stretched to 5,632 units with eight crossings.
      const width = Math.max(...bounds.map((item) => item.x + item.width));
      expect(width).toBeLessThan(4500);
      const segments = links.flatMap((link) =>
        link.points.slice(1).map((end, index) => ({
          id: link.id,
          start: link.points[index]!,
          end,
        })),
      );
      const horizontal = segments.filter(({ start, end }) => start.y === end.y);
      const vertical = segments.filter(({ start, end }) => start.x === end.x);
      let crossings = 0;
      for (const h of horizontal)
        for (const v of vertical) {
          if (h.id === v.id) continue;
          if (
            v.start.x > Math.min(h.start.x, h.end.x) &&
            v.start.x < Math.max(h.start.x, h.end.x) &&
            h.start.y > Math.min(v.start.y, v.end.y) &&
            h.start.y < Math.max(v.start.y, v.end.y)
          )
            crossings++;
        }
      expect(crossings).toBeLessThanOrEqual(1);
      const length = segments.reduce(
        (total, { start, end }) => total + Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
        0,
      );
      expect(length).toBeLessThan(26000);
    }
  },
);

it("defaults to the five connected groups and keeps equal-rate groups separate", () => {
  const { editor, assets, port } = distributionFixture();
  const before = editor.history.getSnapshot();
  const snapshot = distributionSnapshot(editor, assets, port);
  expect(snapshot.detail).toBe("nodes");
  expect(snapshot.sources.map((endpoint) => endpoint.rate)).toEqual([474]);
  snapshot.destinations.forEach((endpoint, index) =>
    expect(endpoint.rate).toBeCloseTo([240, 80, 80, 48, 26][index]!, 6),
  );
  expect(new Set(snapshot.destinations.map((endpoint) => endpoint.id)).size).toBe(5);
  expect(snapshot.destinations[0]!.type).toMatch(/8.*Smelter/);
  const scene = buildScene(snapshot, assets, 4);
  expect(scene.graph.error).toBeUndefined();
  expect(scene.graph.nodes.filter((node) => node.kind === "destination")).toHaveLength(5);
  expect(scene.graph.nodes.filter((node) => node.kind === "splitter")).toHaveLength(7);
  expect(scene.graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(3);
  expect(editor.history.getSnapshot()).toBe(before);
});

it("expands machines with their connected group hints and the same allocated flow", () => {
  const { editor, assets, port } = distributionFixture();
  const snapshot = distributionSnapshot(editor, assets, port, "machines");
  expect(snapshot.destinations).toHaveLength(17);
  const expected = [...Array<number>(8).fill(30), ...Array<number>(6).fill(80 / 3), 24, 24, 26];
  snapshot.destinations.forEach((endpoint, index) =>
    expect(endpoint.rate).toBeCloseTo(expected[index]!, 6),
  );
  expect(snapshot.destinations.reduce((sum, endpoint) => sum + endpoint.rate, 0)).toBeCloseTo(
    474,
    8,
  );
  const request = distributionRequest(snapshot, 4);
  if ("nodes" in request) throw new Error(request.error);
  expect(new Set(request.destinations.map((endpoint) => endpoint.groupId)).size).toBe(5);
  expect(request.destinations[8]!.groupId).not.toBe(request.destinations[11]!.groupId);
  const graph = buildScene(snapshot, assets, 4).graph;
  expect(graph.error).toBeUndefined();
  expect(graph.nodes.filter((node) => node.kind === "splitter")).toHaveLength(17);
  expect(graph.nodes.filter((node) => node.kind === "merger")).toHaveLength(3);
  expect(graph.edges).toHaveLength(42);
});

it("uses the selected connection's actual allocation when previewing an input", () => {
  const { editor, assets } = distributionFixture();
  const snapshot = distributionSnapshot(editor, assets, {
    nodeId: "smelter-1",
    portKey: "input:copper",
  });
  expect(snapshot.sources).toHaveLength(1);
  expect(snapshot.sources[0]!.rate).toBeCloseTo(80, 6);
  expect(snapshot.destinations).toHaveLength(1);
  expect(snapshot.destinations[0]!.rate).toBeCloseTo(80, 6);
  expect(buildScene(snapshot, assets, 2).graph.edges).toHaveLength(1);
});

it("explains the one-belt limit for connected nodes without blocking machine expansion", () => {
  const { editor, assets, port } = distributionFixture();
  const input = { nodeId: "smelter-0", portKey: "input:copper" };
  editor.setMachineCount(port.nodeId, 2);
  const nodes = buildScene(distributionSnapshot(editor, assets, input), assets, 2);
  expect(nodes.graph.error).toContain("connected node exceeds Mk.2");
  expect(nodes.graph.error).toContain("Individual machines");
  expect(nodes.graph.errorCode).toBe("capacity");
  const machines = buildScene(distributionSnapshot(editor, assets, input, "machines"), assets, 2);
  expect(machines.graph.error).toBeUndefined();
});

it("supports sinks and explains ports with no material before starting generation", () => {
  const { editor, assets, port } = distributionFixture();
  const snapshot = distributionSnapshot(editor, assets, port);
  snapshot.destinations[0]!.sink = true;
  expect("nodes" in distributionRequest(snapshot, 4)).toBe(false);
  const missing = distributionRequest(
    distributionSnapshot(editor, assets, { nodeId: "missing", portKey: "input:missing" }),
    4,
  );
  expect("nodes" in missing && missing.errorCode).toBe("unsupported");
});

it.each(["liquid", "gas"] as const)(
  "previews %s flows with pipe tiers, units and a movable shared manifold",
  async (form) => {
    const { editor, assets, port } = distributionFixture(form);
    const before = editor.history.getSnapshot();
    const snapshot = distributionSnapshot(editor, assets, port);
    expect(snapshot.transport).toBe("pipe");
    const scene = buildScene(snapshot, assets, 2);
    expect(scene.graph.error).toBeUndefined();
    expect(scene.graph.nodes.filter((node) => node.kind === "junction")).toHaveLength(4);
    expect(scene.graph.pipeManifold).toBeDefined();
    await scene.layout(new AbortController().signal);
    const { controller } = scene;
    controller.resize({ width: 800, height: 600 });
    for (const node of scene.graph.nodes) {
      const display = scene.getDisplay(node.id)!;
      expect(display.ports.every((connector) => connector.transport === "pipe")).toBe(true);
      if (display.layout === "machine") expect(display.footer?.label).toMatch(/m³\/min/);
      else {
        expect(display.title).toBe("Pipeline T-junction");
        expect(display.pipeJunction).toBe("t");
        expect(display.ports.every((connector) => connector.bidirectional)).toBe(true);
        expect(display.ports).toHaveLength(3);
        expect(
          new Set(display.ports.map((connector) => `${connector.x}:${connector.y}`)).size,
        ).toBe(3);
        for (const connector of display.ports)
          expect([
            [0, 32],
            [64, 32],
            [32, 0],
            [32, 64],
          ]).toContainEqual([connector.x, connector.y]);
      }
    }
    const id = scene.graph.nodes.find((node) => node.kind === "junction")!.id;
    controller.setSelection(new Set([id]));
    controller.command("move-right");
    const state = controller.getSnapshot();
    for (const link of state.links) {
      for (const [ref, point] of [
        [link.output, link.points[0]],
        [link.input, link.points.at(-1)],
      ] as const) {
        const bounds = state.items.find((item) => item.id === ref.nodeId)!;
        const connector = scene
          .getDisplay(ref.nodeId)!
          .ports.find((entry) => entry.key === ref.portKey)!;
        expect(point).toEqual({ x: bounds.x + connector.x, y: bounds.y + connector.y });
      }
    }
    expect(editor.history.getSnapshot()).toBe(before);
  },
);

it.each([8, 16])(
  "lays out %s coal generators on one straight header fed at both ends and between them",
  async (count) => {
    const { editor, assets, port } = distributionFixture("liquid");
    const before = editor.history.getSnapshot();
    const snapshot = distributionSnapshot(editor, assets, port, "machines");
    const source = snapshot.sources[0]!,
      consumer = snapshot.destinations[0]!;
    snapshot.sources = Array.from({ length: (count * 3) / 8 }, (_, index) =>
      Object.assign({}, source, { id: `water${index}`, rate: 120 }),
    );
    snapshot.destinations = Array.from({ length: count }, (_, index) =>
      Object.assign({}, consumer, { id: `coal${index}`, rate: 45 }),
    );
    const scene = buildScene(snapshot, assets, 1);
    await scene.layout(new AbortController().signal);
    const { controller } = scene;
    const state = controller.getSnapshot();
    const items = new Map(state.items.map((item) => [item.id, item]));
    const stations = scene.graph.pipeManifold!.stations;
    const tapIds = new Set(stations.map((station) => station.junctionId!));
    expect(new Set(stations.map((station) => items.get(station.junctionId!)!.x)).size).toBe(1);
    expect(new Set(snapshot.destinations.map((endpoint) => items.get(endpoint.id)!.x)).size).toBe(
      1,
    );
    for (const link of state.links) {
      if (tapIds.has(link.output.nodeId) && tapIds.has(link.input.nodeId)) {
        expect(link.points).toHaveLength(2);
        expect(link.points[0]!.x).toBe(link.points[1]!.x);
      } else {
        expect(link.points).toHaveLength(2);
        expect(link.points[0]!.y).toBe(link.points[1]!.y);
      }
    }
    const feeds = snapshot.sources.map((endpoint) => {
      const edge = scene.graph.edges.find((entry) => entry.from === endpoint.id)!;
      return stations.findIndex((station) => station.junctionId === edge.to);
    });
    expect(feeds.slice(0, 2)).toEqual([0, count - 1]);
    expect(feeds.slice(2).every((index) => index > 0 && index < count - 1)).toBe(true);
    // The middle feed sends net flow in both directions. Dragging must retain
    // the physical north/south sockets, even though both can be output edges.
    const middle = stations[feeds[2]!]!.junctionId!;
    const bounds = items.get(middle)!;
    controller.resize({ width: 800, height: 600 });
    const start = { id: 1, x: bounds.x + 32, y: bounds.y + 32 };
    const end = { ...start, x: start.x + 64, y: start.y + 96 };
    const assertAttached = () => {
      const moved = controller.getSnapshot();
      for (const link of moved.links)
        for (const [ref, point] of [
          [link.output, link.points[0]],
          [link.input, link.points.at(-1)],
        ] as const) {
          const item = moved.items.find((entry) => entry.id === ref.nodeId)!;
          const connector = scene
            .getDisplay(ref.nodeId)!
            .ports.find((entry) => entry.key === ref.portKey)!;
          const offset = moved.selection.has(ref.nodeId) ? moved.dragOffset : { x: 0, y: 0 };
          expect(point).toEqual({
            x: item.x + connector.x + offset.x,
            y: item.y + connector.y + offset.y,
          });
        }
    };
    controller.pointerDown(start);
    controller.pointerMove(end);
    expect(controller.getSnapshot().interaction).toBe("drag");
    assertAttached();
    controller.pointerUp(end);
    assertAttached();
    expect(editor.history.getSnapshot()).toBe(before);
  },
);

it("renders a zero-net-flow pipe as part of the continuous header", async () => {
  const { editor, assets, port } = distributionFixture("liquid");
  const snapshot = distributionSnapshot(editor, assets, port);
  snapshot.sources = ["s0", "s1"].map((id) =>
    Object.assign({}, snapshot.sources[0]!, { id, rate: 100 }),
  );
  snapshot.destinations = snapshot.destinations
    .slice(0, 4)
    .map((endpoint) => Object.assign({}, endpoint, { rate: 50 }));
  const scene = buildScene(snapshot, assets, 1);
  await scene.layout(new AbortController().signal);
  const zero = scene.graph.edges.find((edge) => edge.rate === 0)!;
  const link = scene.controller.getSnapshot().links.find((edge) => edge.id === zero.id)!;
  expect(link.points).toHaveLength(2);
  expect(link.points[0]!.x).toBe(link.points[1]!.x);
  expect(scene.getLinkRates(zero.id)).toEqual(["0"]);
});

it.each([
  { supply: [120], demand: [100, 20], fitting: "t" },
  { supply: [50, 70], demand: [120], fitting: "t" },
  { supply: [120], demand: [37.5, 37.5, 45], fitting: "cross" },
  { supply: [120, 20], demand: [100, 40], fitting: "cross" },
  { supply: [30, 40, 50], demand: [120], fitting: "cross" },
] as const)(
  "keeps physical $fitting sockets attached for $supply → $demand during layout and dragging",
  async ({ supply, demand, fitting }) => {
    const { editor, assets, port } = distributionFixture("liquid");
    const snapshot = distributionSnapshot(editor, assets, port);
    const endpoint = snapshot.sources[0]!;
    snapshot.sources = supply.map((rate, index) => ({ ...endpoint, id: `s${index}`, rate }));
    snapshot.destinations = demand.map((rate, index) => ({ ...endpoint, id: `d${index}`, rate }));
    const scene = buildScene(snapshot, assets, 1);
    await scene.layout(new AbortController().signal);
    const node = scene.graph.nodes.find((entry) => entry.kind === "junction")!;
    const display = scene.getDisplay(node.id)!;
    expect(display.layout === "logistics" && display.pipeJunction).toBe(fitting);
    expect(display.ports).toHaveLength(fitting === "t" ? 3 : 4);
    expect(display.ports.every((connector) => connector.bidirectional)).toBe(true);
    const assertSockets = () => {
      const state = scene.controller.getSnapshot();
      for (const link of state.links) {
        for (const [ref, point, neighbor, side] of [
          [link.output, link.points[0]!, link.points[1]!, link.endpointSides!.output],
          [link.input, link.points.at(-1)!, link.points.at(-2)!, link.endpointSides!.input],
        ] as const) {
          const item = state.items.find((entry) => entry.id === ref.nodeId)!;
          const connector = scene
            .getDisplay(ref.nodeId)!
            .ports.find((entry) => entry.key === ref.portKey)!;
          const moving = state.selection.has(ref.nodeId) ? state.dragOffset : { x: 0, y: 0 };
          expect(point).toEqual({
            x: item.x + connector.x + moving.x,
            y: item.y + connector.y + moving.y,
          });
          if (side === "north" || side === "south") {
            expect(neighbor.x).toBe(point.x);
            expect(Math.sign(neighbor.y - point.y)).toBe(side === "north" ? -1 : 1);
          } else {
            expect(neighbor.y).toBe(point.y);
            expect(Math.sign(neighbor.x - point.x)).toBe(side === "west" ? -1 : 1);
          }
        }
        link.points.slice(1).forEach((point, index) => {
          const previous = link.points[index]!;
          expect(point.x === previous.x || point.y === previous.y).toBe(true);
        });
      }
    };
    assertSockets();
    const bounds = scene.controller.getSnapshot().items.find((entry) => entry.id === node.id)!;
    const start = { id: 1, x: bounds.x + 32, y: bounds.y + 32 };
    const end = { ...start, x: start.x + 64, y: start.y + 96 };
    scene.controller.resize({ width: 800, height: 600 });
    scene.controller.pointerDown(start);
    scene.controller.pointerMove(end);
    expect(scene.controller.getSnapshot().interaction).toBe("drag");
    assertSockets();
    scene.controller.pointerUp(end);
    assertSockets();
  },
);

it("keeps the fourth socket visible when a cross has only three connected pipes", async () => {
  const { editor, assets, port } = distributionFixture("liquid");
  const snapshot = distributionSnapshot(editor, assets, port);
  snapshot.sources = [{ ...snapshot.sources[0]!, rate: 120 }];
  snapshot.destinations = snapshot.destinations
    .slice(0, 2)
    .map((endpoint, index) => Object.assign({}, endpoint, { rate: index === 0 ? 100 : 20 }));
  const graph = buildScene(snapshot, assets, 1).graph;
  const junction = graph.nodes.find((node) => node.kind === "junction")!;
  junction.junctionType = "cross";
  const scene = distributionScene(snapshot, assets, graph);
  await scene.layout(new AbortController().signal);
  const display = scene.getDisplay(junction.id)!;
  expect(display.layout === "logistics" && display.pipeJunction).toBe("cross");
  expect(display.ports).toHaveLength(4);
  expect(new Set(display.ports.map(({ x, y }) => `${x}:${y}`)).size).toBe(4);
  expect(scene.controller.getSnapshot().links).toHaveLength(3);
});

it("moves endpoints and junctions locally with attached belts and unchanged flow rates", async () => {
  const { editor, assets, port } = distributionFixture();
  const beforePlan = editor.history.getSnapshot();
  const scene = buildScene(distributionSnapshot(editor, assets, port), assets, 4);
  await scene.layout(new AbortController().signal);
  const beforeGraph = structuredClone(scene.graph);
  const { controller } = scene;
  controller.resize({ width: 800, height: 600 });
  for (const kind of ["source", "destination", "splitter", "merger"] as const) {
    const id = scene.graph.nodes.find((node) => node.kind === kind)!.id;
    const before = controller.getSnapshot();
    const item = before.items.find((entry) => entry.id === id)!;
    const start = { id: 1, x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const end = { ...start, x: start.x + 64, y: start.y + 96 };
    controller.pointerDown(start);
    controller.pointerMove(end);
    expect(controller.getSnapshot().interaction).toBe("drag");
    const assertRoutes = (dragging: boolean) => {
      const snapshot = controller.getSnapshot();
      for (const link of snapshot.links) {
        const original = before.links.find((entry) => entry.id === link.id)!;
        const affected = link.output.nodeId === id || link.input.nodeId === id;
        if (!affected) expect(link).toBe(original);
        else expect(link.labelPosition).toBeUndefined();
        for (const [ref, point] of [
          [link.output, link.points[0]],
          [link.input, link.points.at(-1)],
        ] as const) {
          const bounds = snapshot.items.find((entry) => entry.id === ref.nodeId)!;
          const connector = scene.getDisplay(ref.nodeId)!.ports.find((p) => p.key === ref.portKey)!;
          expect(point).toEqual({
            x: bounds.x + connector.x + (dragging && ref.nodeId === id ? 64 : 0),
            y: bounds.y + connector.y + (dragging && ref.nodeId === id ? 96 : 0),
          });
        }
        link.points.slice(1).forEach((point, index) => {
          const previous = link.points[index]!;
          expect(point.x === previous.x || point.y === previous.y).toBe(true);
        });
        expect(link.color).toBe(original.color);
        expect(link.dashed).toBe(original.dashed);
        expect(scene.getLinkRates(link.id)).toEqual(scene.getLinkRates(original.id));
      }
    };
    assertRoutes(true);
    controller.pointerUp(end);
    expect(controller.getSnapshot().items.find((entry) => entry.id === id)).toEqual({
      ...item,
      x: item.x + 64,
      y: item.y + 96,
    });
    assertRoutes(false);
  }
  // Moving the whole selection preserves all bends, including feedback routes.
  const before = controller.getSnapshot();
  controller.setSelection(new Set(before.items.map((item) => item.id)));
  controller.command("move-down");
  const after = controller.getSnapshot();
  expect(after.items).toEqual(before.items.map((item) => ({ ...item, y: item.y + 16 })));
  expect(after.links.map((link) => link.points)).toEqual(
    before.links.map((link) => link.points.map((point) => ({ ...point, y: point.y + 16 }))),
  );
  expect(scene.graph).toEqual(beforeGraph);
  expect(editor.history.getSnapshot()).toBe(beforePlan);
});
