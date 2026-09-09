import { createNode } from "@satisfactory-belt/production";
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

function withRecipes(
  document: CanvasDocument,
  recipes: Record<string, string>,
): CanvasDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      recipes[node.configuration.id]
        ? {
            ...node,
            configuration: createNode({
              id: node.configuration.id,
              kind: "process",
              buildableId:
                recipes[node.configuration.id] === "Recipe_IngotIron_C"
                  ? "Build_SmelterMk1_C"
                  : "Build_ConstructorMk1_C",
              processId: recipes[node.configuration.id]!,
            }).configuration,
          }
        : node,
    ),
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
  it("adopts shared supply without merging destination balancers or splitting feedback", () => {
    const document = network([
      "source-shared",
      "shared-a",
      "shared-b",
      "a-loop",
      "loop-a",
      "loop-plates",
      "b-rods",
      "source-parallel",
      "parallel-plates2",
      "unrelated-isolated",
      "isolated-alone",
    ]);
    const recipes: Record<string, string> = {
      source: "Recipe_IngotIron_C",
      unrelated: "Recipe_IngotIron_C",
      plates: "Recipe_IronPlate_C",
      plates2: "Recipe_IronPlate_C",
      rods: "Recipe_IronRod_C",
      alone: "Recipe_IronRod_C",
    };
    const source = withRecipes(document, recipes);
    const result = productionStructure(source);
    expect(result.logistics).toEqual([
      ["a", "loop", "parallel", "shared"],
      ["b", "isolated"],
    ]);
    expect(result.logisticsDestinations.has("shared")).toBe(false);
    // The shared splitter's rod branch crosses the plate group's boundary.
    expect(
      result.logistics.find((group) => group.includes("shared")),
    ).not.toContain("b");
    expect(result.logisticsDestinations.get("a")).toEqual([
      "Recipe_IronPlate_C",
    ]);
    for (const id of result.feedbackLinks) {
      const link = source.materialLinks.find((link) => link.id === id)!;
      expect(
        result.logistics.some(
          (group) =>
            group.includes(link.from.nodeId) && group.includes(link.to.nodeId),
        ),
      ).toBe(true);
    }
    expect(
      productionStructure({
        ...source,
        nodes: source.nodes.toReversed(),
        materialLinks: source.materialLinks.toReversed(),
      }),
    ).toEqual(result);
  });

  it("absorbs successive shared routers while preserving the host identity", () => {
    const document = withRecipes(
      network(["a-b", "a-screws", "b-c", "b-rods", "c-d", "d-plates"]),
      {
        plates: "Recipe_IronPlate_C",
        rods: "Recipe_IronRod_C",
        screws: "Recipe_Screw_C",
      },
    );
    const result = productionStructure(document);
    expect(result.logistics).toEqual([["c", "a", "b", "d"]]);
    expect(result.logisticsDestinations.get("c")).toEqual([
      "Recipe_IronPlate_C",
    ]);
  });

  it("does not create a group cycle by absorbing across an alternate forward path", () => {
    const document = withRecipes(
      network([
        "shared-a",
        "shared-mid",
        "shared-screws",
        "mid-end",
        "end-a",
        "end-rods",
        "a-b",
        "b-c",
        "c-plates",
      ]),
      {
        plates: "Recipe_IronPlate_C",
        rods: "Recipe_IronRod_C",
        screws: "Recipe_Screw_C",
      },
    );
    const result = productionStructure(document);
    // The larger plate group is connected directly and through the middle
    // group. Adopt into the middle group so its forward link stays forward.
    expect(result.logistics).toEqual([
      ["a", "b", "c"],
      ["end", "mid", "shared"],
    ]);
    expect(result.feedbackLinks.size).toBe(0);
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
