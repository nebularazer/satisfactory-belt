import { describe, expect, it } from "vitest";
import { addRouteBend, moveRouteSegment, routeHandles } from "./route-editing";
import { createCanvasEditor } from "./editor";
import { materialLinkPath } from "./material-link-geometry";
import { routeIsClear } from "./orthogonal-router";
import { modularFrameFactory } from "./modular-frame-fixture";
import {
  parseCanvasPlanDocument,
  serializeCanvasPlanDocument,
} from "./plan-document-format";
import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
  materializeDetailedCanvas,
} from "./editor-mode";

const straight = [
  { x: 0, y: 0 },
  { x: 320, y: 0 },
];

describe("Manual route editing", () => {
  it("gives straight connections a draggable segment without moving ports", () => {
    const handle = routeHandles(straight)[0]!;
    const moved = moveRouteSegment(handle.route, handle.index, {
      x: 160,
      y: 80,
    });
    expect(moved[0]).toEqual(straight[0]);
    expect(moved.at(-1)).toEqual(straight.at(-1));
    expect(routeIsClear(moved, [])).toBe(true);
    expect(moved).toContainEqual({ x: 32, y: 80 });
    expect(moved).toContainEqual({ x: 288, y: 80 });
  });

  it("adds an orthogonal detour that can be independently moved", () => {
    const bent = addRouteBend(straight);
    expect(bent[0]).toEqual(straight[0]);
    expect(bent.at(-1)).toEqual(straight.at(-1));
    expect(bent.length).toBeGreaterThan(straight.length);
    expect(routeIsClear(bent, [])).toBe(true);
    expect(routeHandles(bent).length).toBeGreaterThan(1);
  });

  it("previews one drag, commits one history entry, cancels, and resets", () => {
    const editor = createCanvasEditor({
      document: modularFrameFactory(false),
      snapToGrid: false,
    });
    const before = editor.getState().document;
    const link = before.materialLinks[0]!;
    const handle = routeHandles(materialLinkPath(before, link)!.route!)[0]!;
    editor.dispatch({ type: "selection.link", id: link.id, additive: false });
    editor.dispatch({
      type: "link.route.begin",
      id: link.id,
      route: handle.route,
      segment: handle.index,
    });
    editor.dispatch({
      type: "link.route.update",
      at: { x: handle.point.x, y: handle.point.y + 32 },
    });
    expect(editor.getState().routeEdit?.valid).toBe(true);
    expect(editor.getState().document).toBe(before);
    editor.dispatch({ type: "link.route.commit" });
    const after = editor.getState().document;
    expect(after.materialLinks[0]!.routeMode).toBe("manual");
    expect(after.nodes).toBe(before.nodes);
    expect(parseCanvasPlanDocument(serializeCanvasPlanDocument(after))).toEqual(
      after,
    );
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document).toEqual(before);
    expect(editor.getState().canUndo).toBe(false);
    editor.dispatch({ type: "history.redo" });
    expect(editor.getState().document).toEqual(after);
    const nextHandle = routeHandles(
      materialLinkPath(after, after.materialLinks[0]!)!.route!,
    )[0]!;
    editor.dispatch({
      type: "link.route.begin",
      id: link.id,
      route: nextHandle.route,
      segment: nextHandle.index,
    });
    editor.dispatch({ type: "link.route.update", at: { x: 999, y: 999 } });
    editor.dispatch({ type: "link.route.cancel" });
    expect(editor.getState().document).toEqual(after);
    expect(editor.getState().routeEdit).toBeUndefined();
    editor.dispatch({ type: "link.route.reset", id: link.id });
    expect(
      editor.getState().document.materialLinks[0]!.routeMode,
    ).toBeUndefined();
    expect(
      materialLinkPath(
        editor.getState().document,
        editor.getState().document.materialLinks[0]!,
      )!.route,
    ).toBeDefined();
    editor.dispatch({ type: "history.undo" });
    expect(editor.getState().document).toEqual(after);
  });

  it("rejects a drag through a card without adding a history entry", () => {
    const editor = createCanvasEditor({
      document: modularFrameFactory(false),
      snapToGrid: false,
    });
    const link = editor.getState().document.materialLinks[0]!;
    editor.dispatch({ type: "link.route.bend", id: link.id });
    const before = editor.getState().document;
    const handle = routeHandles(
      materialLinkPath(before, before.materialLinks[0]!)!.route,
    ).find(({ axis }) => axis === "x")!;
    expect(handle).toBeDefined();
    editor.dispatch({
      type: "link.route.begin",
      id: link.id,
      route: handle.route,
      segment: handle.index,
    });
    editor.dispatch({
      type: "link.route.update",
      at: { x: 128, y: handle.point.y },
    });
    expect(editor.getState().routeEdit?.valid).toBe(false);
    editor.dispatch({ type: "link.route.commit" });
    expect(editor.getState().document).toBe(before);
    editor.dispatch({ type: "history.undo" });
    expect(
      editor.getState().document.materialLinks[0]!.routeMode,
    ).toBeUndefined();
  });

  it("translates manual bends with a group and copies them with the connection", () => {
    const editor = createCanvasEditor({
      document: modularFrameFactory(false),
      snapToGrid: false,
    });
    editor.dispatch({ type: "link.route.bend", id: "ore" });
    const manual = editor.getState().document.materialLinks[0]!;
    editor.dispatch({
      type: "selection.node",
      id: manual.from.nodeId,
      additive: false,
    });
    editor.dispatch({
      type: "selection.node",
      id: manual.to.nodeId,
      additive: true,
    });
    editor.dispatch({ type: "selection.nudge", delta: { x: -96, y: 32 } });
    const moved = editor.getState().document;
    expect(materialLinkPath(moved, moved.materialLinks[0]!)!.route).toEqual(
      manual.route!.map(({ x, y }) => ({ x: x - 96, y: y + 32 })),
    );
    editor.dispatch({ type: "selection.duplicate" });
    const copied = editor.getState().document.materialLinks.at(-1)!;
    expect(copied.routeMode).toBe("manual");
    // The stored route is translated when copied; endpoint adaptation then
    // accounts for any prior manual node moves, just as it does before copying.
    expect(copied.route).not.toEqual(manual.route);
    expect(copied.from.nodeId).not.toBe(manual.from.nodeId);
  });

  it("persists manual intent in Detailed plans and follows moved endpoints", () => {
    const detailed = materializeDetailedCanvas(modularFrameFactory(false));
    const source = modularFrameFactory(false);
    const basicEditor = createCanvasEditor({
      document: source,
      snapToGrid: false,
    });
    basicEditor.dispatch({
      type: "link.route.bend",
      id: source.materialLinks[0]!.id,
    });
    const manual = basicEditor.getState().document;
    const link = manual.materialLinks[0]!;
    expect(link.routeMode).toBe("manual");
    basicEditor.dispatch({
      type: "selection.node",
      id: link.from.nodeId,
      additive: false,
    });
    basicEditor.dispatch({ type: "selection.nudge", delta: { x: -64, y: 32 } });
    const path = materialLinkPath(basicEditor.getState().document, link)!;
    expect(path.from).not.toEqual(link.route![0]);
    expect(
      path.route
        ?.slice(1, -1)
        .some((point) =>
          link.route!.some(
            (saved) => saved.x === point.x && saved.y === point.y,
          ),
        ),
    ).toBe(true);
    const detailedManual = {
      ...detailed,
      connectionRoutes: { [detailed.connections[0]!.id]: straight },
      manualConnectionIds: [detailed.connections[0]!.id],
    };
    const persisted = detailedDocumentFromEditor(
      detailedDocumentToEditor(detailedManual),
      detailed.tiers,
    );
    expect(
      parseCanvasPlanDocument(serializeCanvasPlanDocument(persisted)),
    ).toEqual(detailedManual);
  });
});
