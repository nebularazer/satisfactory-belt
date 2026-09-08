import { describe, expect, it } from "vitest";
import { productionStructure } from "./production-structure";
import { EMPTY_CANVAS_DOCUMENT, type CanvasDocument } from "./document";
import { testCanvasNode } from "./test-fixtures";
import { dashedRoute } from "./dashed-route";

function network(edges: string[]): CanvasDocument {
  return {
    ...EMPTY_CANVAS_DOCUMENT,
    nodes: [...new Set(edges.flatMap((edge) => edge.split("-")))].map((id) =>
      testCanvasNode(id),
    ),
    materialLinks: edges.map((id) => {
      const [from, to] = id.split("-");
      return {
        id,
        from: { nodeId: from!, portId: "output:1" },
        to: { nodeId: to!, portId: "input:1" },
      };
    }),
  };
}

describe("Production structure", () => {
  it("keeps ordinary distribution, collection and long bypasses solid", () => {
    const document = network(["s-a", "s-b", "a-c", "b-c", "s-c"]);
    const result = productionStructure(document);
    expect(result.feedbackLinks.size).toBe(0);
    expect(result.returnNodes.size).toBe(0);
    expect(result.logistics).toHaveLength(1);
  });
  it("identifies the complete return path including feeds to parallel branches", () => {
    const document = network([
      "s-root",
      "root-a",
      "root-b",
      "root-c",
      "a-x",
      "b-y",
      "c-z",
      "z-sink",
      "z-return",
      "return-a",
      "return-b",
      "return-c",
    ]);
    const result = productionStructure(document);
    expect([...result.feedbackLinks].sort()).toEqual([
      "return-a",
      "return-b",
      "return-c",
      "z-return",
    ]);
    expect([...result.returnNodes]).toEqual(["return"]);
    const opened = productionStructure({
      ...document,
      materialLinks: document.materialLinks.filter(
        (link) => link.id !== "z-return",
      ),
    });
    expect(opened.feedbackLinks.size).toBe(0);
    expect(opened.returnNodes.size).toBe(0);
    expect(
      productionStructure({
        ...document,
        nodes: document.nodes
          .toReversed()
          .map((node) => ({ ...node, x: -node.x - 999 })),
        materialLinks: document.materialLinks.toReversed(),
      }),
    ).toEqual(result);
  });
  it("handles isolated cycles and self-loops deterministically", () => {
    const document = network(["a-b", "b-a", "c-c"]);
    expect([...productionStructure(document).feedbackLinks].sort()).toEqual([
      "a-b",
      "b-a",
      "c-c",
    ]);
  });
  it("draws screen-sized dashes along rounded corners while leaving the route intact", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
    ];
    const strokes = dashedRoute(route, 1);
    expect(strokes[0]).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(strokes[1]![0]).toEqual({ x: 16, y: 0 });
    expect(
      strokes
        .flat()
        .some(
          (point) =>
            point.x > 70 && point.x < 80 && point.y > 0 && point.y < 10,
        ),
    ).toBe(true);
    expect(dashedRoute(route, 0.5)[0]!.at(-1)).toEqual({ x: 20, y: 0 });
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
    ]);
  });
});
