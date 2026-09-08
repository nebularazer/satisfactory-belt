import { describe, expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { arrangeCanvas as computeArrangement } from "./auto-layout";
import type { CanvasDocument } from "./document";
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

const arrangeCanvas = (document: CanvasDocument) =>
  computeArrangement(document, new ELK());

describe("Auto-arrange", () => {
  it("lays out the Detailed Modular Frame factory without overlaps or routes through cards", async () => {
    const detailed = materializeDetailedCanvas(modularFrameFactory(false));
    const source = detailedDocumentToEditor(detailed);
    const result = await arrangeCanvas(source);
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
  }, 20_000);

  it("supports Basic plans and preserves their routes through save/reload", async () => {
    const result = await arrangeCanvas(modularFrameFactory(false));
    expect(
      parseCanvasPlanDocument(serializeCanvasPlanDocument(result)),
    ).toEqual(result);
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
