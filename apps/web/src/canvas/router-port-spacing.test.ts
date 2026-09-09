import { expect, it } from "vitest";
import { spaceRouterPorts } from "./router-port-spacing";
import { EMPTY_CANVAS_DOCUMENT } from "./document";
import { testCanvasNode } from "./test-fixtures";
import { materialPortGeometry } from "./material-port-geometry";

it("puts the unused slot between two active splitter outputs and merger inputs", () => {
  for (const used of [
    [1, 2],
    [1, 3],
    [2, 3],
  ]) {
    const splitter = testCanvasNode("splitter");
    const merger = {
      ...testCanvasNode("merger"),
      configuration: {
        ...testCanvasNode("merger").configuration,
        buildableId: "Build_ConveyorAttachmentMerger_C",
      },
    };
    const document = {
      ...EMPTY_CANVAS_DOCUMENT,
      nodes: [splitter, merger],
      materialLinks: used.map((port) => ({
        id: String(port),
        from: { nodeId: "splitter", portId: `output:${port}` },
        to: { nodeId: "merger", portId: `input:${port}` },
      })),
    };
    const result = spaceRouterPorts(document);
    for (const node of result.nodes) {
      const direction =
        node.configuration.id === "splitter" ? "output" : "input";
      const ports = materialPortGeometry(node).filter(
        ({ port }) => port.direction === direction,
      );
      const active = ports.map(({ port }) =>
        used.some((number) => port.id === `${direction}:${number}`),
      );
      expect(active).toEqual([true, false, true]);
    }
    expect(result.materialLinks).toBe(document.materialLinks);
    expect(result.nodes.map((node) => node.configuration)).toEqual(
      document.nodes.map((node) => node.configuration),
    );
    expect(spaceRouterPorts(result)).toBe(result);
  }
});
it("preserves connected-port order and port-specific rules", () => {
  const node = {
    ...testCanvasNode("splitter"),
    portOrder: { output: ["output:3", "output:2", "output:1"] },
    routerRules: { "output:2": ["overflow"] },
  };
  const document = {
    ...EMPTY_CANVAS_DOCUMENT,
    nodes: [node],
    materialLinks: [2, 3].map((port) => ({
      id: String(port),
      from: { nodeId: "splitter", portId: `output:${port}` },
      to: { nodeId: "sink", portId: "input:1" },
    })),
  };
  const result = spaceRouterPorts(document);
  expect(result.nodes[0]!.portOrder!.output).toEqual([
    "output:3",
    "output:1",
    "output:2",
  ]);
  expect(result.nodes[0]!.routerRules).toBe(node.routerRules);
});
it("leaves one-way and three-way routers alone", () => {
  for (const count of [0, 1, 3]) {
    const document = {
      ...EMPTY_CANVAS_DOCUMENT,
      nodes: [testCanvasNode("splitter")],
      materialLinks: Array.from({ length: count }, (_, index) => ({
        id: String(index),
        from: { nodeId: "splitter", portId: `output:${index + 1}` },
        to: { nodeId: `sink${index}`, portId: "input:1" },
      })),
    };
    expect(spaceRouterPorts(document)).toBe(document);
  }
});
