import { generateProduction } from "../auto-build/generate-production";
import { convertDetailed } from "../detailed-conversion/convert";
import { productionStructure } from "./production-structure";
import { presentMaterialFlow } from "./material-link-presentation";
import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { createNode } from "@satisfactory-belt/production";
import { arrangeCanvas as computeArrangement } from "./auto-layout";
import type { CanvasDocument, CanvasNode } from "./document";
import { createCanvasEditor } from "./editor";
import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
  materializeDetailedCanvas,
} from "./editor-mode";
import { modularFrameFactory } from "./modular-frame-fixture";
import {
  createMaterialLinkIndex,
  materialLinkPath,
  materialLinkLabelPoint,
} from "./material-link-geometry";
import {
  parseCanvasPlanDocument,
  serializeCanvasPlanDocument,
} from "./plan-document-format";
import { EMPTY_CANVAS_DOCUMENT } from "./document";
import { testCanvasNode } from "./test-fixtures";
import { materialPortGeometry } from "./material-port-geometry";
import { routeIsClear } from "./orthogonal-router";

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

describe("Auto-arrange", () => {
  it("lays out the Detailed Modular Frame factory without overlaps or routes through cards", async () => {
    const detailed = materializeDetailedCanvas(modularFrameFactory(false));
    const canvas = detailedDocumentToEditor(detailed);
    const source = {
      ...canvas,
      nodes: canvas.nodes.map((node) => ({
        ...node,
        portOrder: {
          input: materialPortGeometry(node)
            .filter(({ side }) => side === "left")
            .map(({ port }) => port.id)
            .toReversed(),
        },
      })),
    };
    const result = await arrangeCanvas(source);
    expectRecipeColumns(result);
    expectAttachedClearRoutes(result);
    expect(result.nodes.map(({ configuration }) => configuration)).toEqual(
      source.nodes.map(({ configuration }) => configuration),
    );
    expect(
      result.materialLinks.map(({ route: _route, ...link }) => link),
    ).toEqual(source.materialLinks);
    for (const [index, node] of result.nodes.entries()) {
      for (const other of result.nodes.slice(index + 1)) {
        expect(
          node.x < other.x + other.width &&
            node.x + node.width > other.x &&
            node.y < other.y + other.height &&
            node.y + node.height > other.y,
        ).toBe(false);
      }
    }
    const index = createMaterialLinkIndex(result);
    for (const link of result.materialLinks) {
      const path = materialLinkPath(result, link)!;
      expect(path.route, link.id).toEqual(link.route);
      expect(path.route, link.id).toBeDefined();
      const label = materialLinkLabelPoint(path);
      expect(index.hitTest(label, 4)?.id).toBe(link.id);
    }
    expect(await arrangeCanvas(result)).toEqual(result);

    const editor = createCanvasEditor({
      document: source,
      topology: "physical",
    });
    editor.dispatch({
      type: "document.arrange",
      source: editor.getState().document,
      document: result,
    });
    expect(editor.getState().document).toEqual(result);
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document).toEqual(source);
    expect(editor.getState().canUndo).toBe(false);
    editor.dispatch({ type: "history.redo" });
    expect(editor.getState().document).toEqual(result);

    const persisted = detailedDocumentFromEditor(result, detailed.tiers);
    const restored = parseCanvasPlanDocument(
      serializeCanvasPlanDocument(persisted),
    );
    expect(restored).toEqual(persisted);
    if (restored.kind !== "detailed") throw new Error("Expected Detailed plan");
    expect(detailedDocumentToEditor(restored)).toEqual(result);
  }, 40_000);

  it("separates full logistics networks from recipe stacks and reserves a return lane", async () => {
    const { document } = generateProduction({
      outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
      allowedAlternateIds: [],
      pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
    });
    const source = detailedDocumentToEditor(
      convertDetailed(
        document,
        { conveyorTierId: "conveyor-mk1", pipelineTierId: "pipeline-mk2" },
        () => {},
      ),
    );
    const result = await arrangeCanvas(source);
    expectRecipeColumns(result);
    expectAttachedClearRoutes(result);
    const parts = result.nodes.filter(
      (node) =>
        node.configuration.kind === "process" &&
        [
          "Recipe_IronPlate_C",
          "Recipe_Alternate_Screw_C",
          "Recipe_IronRod_C",
        ].includes(node.configuration.processId),
    );
    expect(new Set(parts.map((node) => node.x)).size).toBe(1);
    expect(presentMaterialFlow(result).links).toEqual(
      presentMaterialFlow(source).links,
    );
    const structure = productionStructure(result);
    expect(structure.logistics).toHaveLength(6);
    for (const ids of structure.logistics) {
      const members = result.nodes.filter((node) =>
        ids.includes(node.configuration.id),
      );
      const left = Math.min(...members.map((node) => node.x));
      const right = Math.max(...members.map((node) => node.x + node.width));
      const top = Math.min(...members.map((node) => node.y));
      const bottom = Math.max(...members.map((node) => node.y + node.height));
      for (const node of result.nodes.filter(
        (node) => !ids.includes(node.configuration.id),
      )) {
        expect(
          node.x < right &&
            node.x + node.width > left &&
            node.y < bottom &&
            node.y + node.height > top,
          node.configuration.id,
        ).toBe(false);
      }
      const forward = members.filter(
        (node) => !structure.returnNodes.has(node.configuration.id),
      );
      for (const node of members.filter((node) =>
        structure.returnNodes.has(node.configuration.id),
      ))
        expect(node.y).toBeGreaterThan(
          Math.max(...forward.map((node) => node.y + node.height)),
        );
    }
    const flows = presentMaterialFlow(result);
    const rodReturns = flows.links.filter(
      (link) =>
        link.itemId === "Desc_IronRod_C" &&
        structure.feedbackLinks.has(link.id),
    );
    expect(
      rodReturns.map((link) => link.ratePerMinute).sort((a, b) => a! - b!),
    ).toEqual([4, 4, 4, 12]);
    for (const flow of rodReturns.filter((flow) => flow.ratePerMinute === 4)) {
      const route = result.materialLinks.find(
        (link) => link.id === flow.id,
      )!.route!;
      expect(route[1]!.y).toBe(route[0]!.y);
      expect(route[1]!.x - route[0]!.x).toBeGreaterThan(128);
      expect(Math.max(...route.map((point) => point.y))).toBe(route[0]!.y);
    }
    for (const node of result.nodes.filter(
      (node) => node.configuration.kind === "router",
    )) {
      for (const direction of ["input", "output"] as const) {
        const ports = materialPortGeometry(node).filter(
          ({ port }) => port.direction === direction,
        );
        const active = new Set(
          result.materialLinks
            .flatMap((link) => [link.from, link.to])
            .filter((endpoint) => endpoint.nodeId === node.configuration.id)
            .map((endpoint) => endpoint.portId),
        );
        if (
          ports.length === 3 &&
          ports.filter(({ port }) => active.has(port.id)).length === 2
        )
          expect(active.has(ports[1]!.port.id)).toBe(false);
      }
    }
    const returnRoutes = rodReturns.map(
      (flow) =>
        result.materialLinks.find((link) => link.id === flow.id)!.route!,
    );
    const vertical = (route: (typeof returnRoutes)[number]) =>
      route.slice(1).flatMap((to, index) => {
        const from = route[index]!;
        return from.x === to.x
          ? [
              {
                x: from.x,
                top: Math.min(from.y, to.y),
                bottom: Math.max(from.y, to.y),
              },
            ]
          : [];
      });
    for (let i = 0; i < returnRoutes.length; i++)
      for (const other of returnRoutes.slice(i + 1)) {
        for (const a of vertical(returnRoutes[i]!))
          for (const b of vertical(other)) {
            if (a.x === b.x)
              expect(
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
              ).toBeLessThanOrEqual(0);
          }
      }
    expect(
      result.materialLinks.map(({ route: _route, ...link }) => link),
    ).toEqual(source.materialLinks);
    expect(await arrangeCanvas(result)).toEqual(result);
  }, 20_000);

  it("supports Basic plans and preserves their routes through save/reload", async () => {
    const result = await arrangeCanvas(modularFrameFactory(false));
    expect(
      parseCanvasPlanDocument(serializeCanvasPlanDocument(result)),
    ).toEqual(result);
  });

  it("stacks matching recipes with different card sizes and preserves their actual ports", async () => {
    const factory = modularFrameFactory(false);
    const smelter = factory.nodes.find(
      (node) => node.configuration.id === "smelters",
    )!;
    const plate = factory.nodes.find(
      (node) => node.configuration.id === "plates",
    )!;
    const source: CanvasDocument = {
      ...EMPTY_CANVAS_DOCUMENT,
      nodes: [
        { ...smelter, width: 320, height: 352 },
        {
          ...smelter,
          configuration: { ...smelter.configuration, id: "second-smelter" },
          label: "Renamed smelter",
          width: 256,
          x: -140,
          y: 255,
        },
        plate,
      ],
      materialLinks: ["smelters", "second-smelter"].map((id) => ({
        id,
        from: { nodeId: id, portId: "output:Desc_IronIngot_C" },
        to: { nodeId: "plates", portId: "input:Desc_IronIngot_C" },
      })),
    };
    const result = await arrangeCanvas(source);
    expectRecipeColumns(result);
    expectAttachedClearRoutes(result);
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

  it("handles empty plans, disconnected nodes, and feedback cycles", async () => {
    expect(await arrangeCanvas(EMPTY_CANVAS_DOCUMENT)).toEqual(
      EMPTY_CANVAS_DOCUMENT,
    );
    const result = await arrangeCanvas({
      ...EMPTY_CANVAS_DOCUMENT,
      nodes: [
        testCanvasNode("a"),
        testCanvasNode("b"),
        testCanvasNode("isolated"),
      ],
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
    });
    expect(new Set(result.nodes.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
    expect(
      result.materialLinks.every(
        (link) => link.route && materialLinkPath(result, link)?.route,
      ),
    ).toBe(true);
  });

  it("keeps recipe columns and clear routes when grouping introduces a feedback cycle", async () => {
    const nodes = [
      ["rubber-1", "Recipe_Alternate_RecycledRubber_C"],
      ["plastic", "Recipe_Alternate_Plastic_1_C"],
      ["rubber-2", "Recipe_Alternate_RecycledRubber_C"],
    ].map(([id, processId]) => ({
      configuration: createNode({
        kind: "process",
        id: id!,
        processId: processId!,
        buildableId: "Build_OilRefinery_C",
      }).configuration,
      label: id!,
      x: 0,
      y: 0,
      width: 256,
      height: 256,
    }));
    const result = await arrangeCanvas({
      ...EMPTY_CANVAS_DOCUMENT,
      nodes,
      materialLinks: [
        {
          id: "rubber",
          from: { nodeId: "rubber-1", portId: "output:Desc_Rubber_C" },
          to: { nodeId: "plastic", portId: "input:Desc_Rubber_C" },
        },
        {
          id: "plastic",
          from: { nodeId: "plastic", portId: "output:Desc_Plastic_C" },
          to: { nodeId: "rubber-2", portId: "input:Desc_Plastic_C" },
        },
      ],
    });
    expectRecipeColumns(result);
    expectAttachedClearRoutes(result);
  });

  it("rejects stale results and follows manually moved ports", async () => {
    const editor = createCanvasEditor({ document: modularFrameFactory(false) });
    const source = editor.getState().document;
    const result = await arrangeCanvas(source);
    editor.dispatch({ type: "document.arrange", source, document: result });
    editor.dispatch({ type: "selection.node", id: "miners", additive: false });
    editor.dispatch({ type: "selection.nudge", delta: { x: 32, y: 16 } });
    const moved = editor.getState().document;
    editor.dispatch({ type: "document.arrange", source, document: result });
    expect(editor.getState().document).toBe(moved);
    const movedRoute = materialLinkPath(moved, moved.materialLinks[0]!)?.route;
    expect(movedRoute).toBeDefined();
    expect(movedRoute).not.toEqual(result.materialLinks[0]!.route);
    editor.dispatch({ type: "history.undo" });
    expect(
      materialLinkPath(editor.getState().document, result.materialLinks[0]!)
        ?.route,
    ).toBeDefined();
  });
});
