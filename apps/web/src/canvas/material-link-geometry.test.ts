import { describe, expect, it } from "vitest";

import type { CanvasDocument } from "./document";
import { createMaterialLinkIndex } from "./material-link-geometry";
import { testCanvasNode } from "./test-fixtures";

describe("Material Link geometry index", () => {
  it("culls by curve bounds and keeps paths crossing the viewport", () => {
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
    expect(index.hitTest({ x: 288, y: 96 }, 12)?.id).toBe("link");
    expect(index.hitTest({ x: 288, y: 130 }, 4)).toBeUndefined();
  });
});
