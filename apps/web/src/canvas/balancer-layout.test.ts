import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { arrangeCanvas as computeArrangement } from "./auto-layout";
import {
  EMPTY_CANVAS_DOCUMENT,
  type CanvasDocument,
  type CanvasNode,
} from "./document";
import { testCanvasNode, testBalancerFactory } from "./test-fixtures";
import { materialPortGeometry } from "./material-port-geometry";
import { routeIsClear } from "./orthogonal-router";
import { balancerLayoutBlocks } from "./balancer-layout";

const arrangeCanvas = (document: CanvasDocument) =>
  computeArrangement(document, new ELK());

function expectRecipeColumns(document: CanvasDocument) {
  const recipes = new Map<string, CanvasNode[]>();
  for (const node of document.nodes) {
    if (node.configuration.kind !== "process") continue;
    const siblings = recipes.get(node.configuration.processId) ?? [];
    siblings.push(node);
    recipes.set(node.configuration.processId, siblings);
  }
  for (const [recipe, nodes] of recipes) {
    expect(new Set(nodes.map((node) => node.x)).size, recipe).toBe(1);
    const stack = nodes.toSorted((a, b) => a.y - b.y);
    for (let index = 1; index < stack.length; index++) {
      const previous = stack[index - 1]!;
      expect(stack[index]!.y - previous.y - previous.height, recipe).toBe(64);
    }
  }
}

function expectAttachedClearRoutes(document: CanvasDocument) {
  const ports = document.nodes.flatMap(materialPortGeometry);
  for (const link of document.materialLinks) {
    const from = ports.find(
      ({ nodeId, port }) =>
        nodeId === link.from.nodeId && port.id === link.from.portId,
    )!;
    const to = ports.find(
      ({ nodeId, port }) =>
        nodeId === link.to.nodeId && port.id === link.to.portId,
    )!;
    expect(link.route?.[0], link.id).toEqual(from.point);
    expect(link.route?.at(-1), link.id).toEqual(to.point);
    expect(
      routeIsClear(
        link.route!,
        document.nodes.map((node) => ({ ...node, id: node.configuration.id })),
      ),
      link.id,
    ).toBe(true);
  }
}

describe("Balancer layout", () => {
  it("keeps uneven branches separate and routes every leaf around the cards", async () => {
    const factory = testBalancerFactory();
    const removed = new Set(["machine-1-2", "machine-1-3", "machine-3-3"]);
    const source = {
      ...factory,
      nodes: factory.nodes.filter(
        (node) => !removed.has(node.configuration.id),
      ),
      materialLinks: factory.materialLinks.filter(
        (link) =>
          !removed.has(link.from.nodeId) && !removed.has(link.to.nodeId),
      ),
    };
    const result = await arrangeCanvas(source);
    expectRecipeColumns(result);
    expectAttachedClearRoutes(result);
    for (const kind of ["split", "merge"]) {
      const branches = result.nodes
        .filter((node) =>
          [1, 2, 3].some(
            (index) => node.configuration.id === `${kind}-${index}`,
          ),
        )
        .toSorted((a, b) => a.y - b.y);
      for (let index = 1; index < branches.length; index++)
        expect(
          branches[index]!.y -
            branches[index - 1]!.y -
            branches[index - 1]!.height,
        ).toBeGreaterThanOrEqual(64);
    }
    expect(
      await arrangeCanvas({
        ...source,
        nodes: source.nodes.toReversed(),
        materialLinks: source.materialLinks.toReversed(),
      }),
    ).toEqual({
      ...result,
      nodes: result.nodes.toReversed(),
      materialLinks: result.materialLinks.toReversed(),
    });
  });

  it("leaves cyclic router networks to the general layout", () => {
    expect(
      balancerLayoutBlocks({
        ...EMPTY_CANVAS_DOCUMENT,
        nodes: [testCanvasNode("a"), testCanvasNode("b")],
        materialLinks: [
          {
            id: "ab",
            from: { nodeId: "a", portId: "output:1" },
            to: { nodeId: "b", portId: "input:1" },
          },
          {
            id: "ba",
            from: { nodeId: "b", portId: "output:1" },
            to: { nodeId: "a", portId: "input:1" },
          },
        ],
      }),
    ).toEqual([]);
  });

  it.each([2, 3])(
    "lays out %s-way belt trees as mirrored triangles around a recipe column",
    async (arity) => {
      const source = testBalancerFactory(arity);
      const result = await arrangeCanvas(source);
      expectRecipeColumns(result);
      expectAttachedClearRoutes(result);
      const placed = new Map(
        result.nodes.map((node) => [node.configuration.id, node]),
      );
      for (const kind of ["split", "merge"]) {
        const root = placed.get(`${kind}-root`)!;
        const branches = Array.from({ length: arity }, (_, index) =>
          placed.get(`${kind}-${index + 1}`)!,
        );
        expect(new Set(branches.map((node) => node.x)).size).toBe(1);
        expect(root.y + root.height / 2).toBe(
          (branches[0]!.y + branches.at(-1)!.y + branches.at(-1)!.height) / 2,
        );
        for (const branch of branches) {
          expect(
            kind === "split"
              ? branch.x - root.x - root.width
              : root.x - branch.x - branch.width,
          ).toBe(128);
        }
        expect(branches.map((node) => node.y)).toEqual(
          branches.map((node) => node.y).toSorted((a, b) => a - b),
        );
      }
      expect(result.nodes.map(({ configuration }) => configuration)).toEqual(
        source.nodes.map(({ configuration }) => configuration),
      );
      expect(
        result.materialLinks.map(({ route: _route, ...link }) => link),
      ).toEqual(source.materialLinks);
      expect(await arrangeCanvas(result)).toEqual(result);
    },
  );
});
