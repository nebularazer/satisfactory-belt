import { describe, expect, it } from "vitest";

import type { CanvasDocument } from "./document";
import {
  createMaterialLinkIndex,
  materialLinkPath,
  materialLinkPoint,
  connectionPreviewRoute,
} from "./material-link-geometry";
import { testCanvasNode } from "./test-fixtures";
import { modularFrameFactory } from "./modular-frame-fixture";
import { materialPortGeometry } from "./material-port-geometry";

describe("Material Link geometry", () => {
  it("matches the final route when connecting from an input port", () => {
    const source = modularFrameFactory(false);
    const document = {
      ...source,
      nodes: source.nodes.map((node, index) =>
        index === 1 ? { ...node, y: node.y + 96 } : node,
      ),
    };
    const link = document.materialLinks[0]!;
    const fromNode = document.nodes.find(
      ({ configuration }) => configuration.id === link.from.nodeId,
    )!;
    const toNode = document.nodes.find(
      ({ configuration }) => configuration.id === link.to.nodeId,
    )!;
    const output = materialPortGeometry(fromNode).find(
      ({ port }) => port.id === link.from.portId,
    )!;
    const input = materialPortGeometry(toNode).find(
      ({ port }) => port.id === link.to.portId,
    )!;
    expect(
      connectionPreviewRoute(document, input, output).toReversed(),
    ).toEqual(materialLinkPath(document, link)!.route);
  });

  it("culls by route bounds and keeps paths crossing the viewport", () => {
    const from = testCanvasNode("from", -500, 0);
    const to = testCanvasNode("to", 500, 0);
    const document: CanvasDocument = {
      kind: "basic",
      materialLinks: [
        {
          from: { nodeId: "from", portId: "output:1" },
          id: "crossing",
          to: { nodeId: "to", portId: "input:1" },
        },
      ],
      nodes: [from, to],
      version: 4,
    };
    const index = createMaterialLinkIndex(document);
    expect(index.query({ height: 200, width: 100, x: -50, y: 0 })).toHaveLength(
      1,
    );
  });

  it("supports screen-space hit targets through a caller-provided radius", () => {
    const from = testCanvasNode("from", 0, 0);
    const to = testCanvasNode("to", 400, 0);
    const document: CanvasDocument = {
      kind: "basic",
      materialLinks: [
        {
          from: { nodeId: "from", portId: "output:1" },
          id: "link",
          to: { nodeId: "to", portId: "input:1" },
        },
      ],
      nodes: [from, to],
      version: 4,
    };
    const index = createMaterialLinkIndex(document);
    const point = materialLinkPoint(
      materialLinkPath(document, document.materialLinks[0]!)!,
      0.4,
    );
    expect(index.hitTest({ x: point.x, y: point.y + 8 }, 12)?.id).toBe("link");
    expect(index.hitTest({ x: point.x, y: point.y + 8 }, 4)).toBeUndefined();
  });
});
