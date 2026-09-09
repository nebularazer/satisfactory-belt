import { expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { arrangeCanvas } from "./auto-layout";
import { modularFrameFactory } from "./modular-frame-fixture";
import { productionRegions } from "./production-regions";
import { createCanvasEditor } from "./editor";
import {
  parseCanvasPlanDocument,
  serializeCanvasPlanDocument,
} from "./plan-document-format";
import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
  materializeDetailedCanvas,
} from "./editor-mode";
import { parseGroupNames } from "./group-names";
import { hitProductionGroup } from "./group-label-layout";

it("selects, renames, resets and persists production and logistics group names", async () => {
  const basic = await arrangeCanvas(modularFrameFactory(false), new ELK());
  const detailed = materializeDetailedCanvas(modularFrameFactory(false));
  for (const source of [
    basic,
    await arrangeCanvas(detailedDocumentToEditor(detailed), new ELK()),
  ]) {
    const editor = createCanvasEditor({
      document: source,
      topology: "physical",
    });
    const groups = productionRegions(source);
    for (const group of [
      groups.find((group) => !group.logistics)!,
      groups.find((group) => group.logistics),
    ].filter((group) => !!group)) {
      expect(
        hitProductionGroup(source, { x: group.x + 28, y: group.y + 28 })?.id,
      ).toBe(group.id);
      editor.dispatch({ type: "selection.group", id: group.id });
      expect(editor.getState().selectedIds).toEqual(group.nodeIds);
      expect(editor.getState().selectedGroupId).toBe(group.id);
      editor.dispatch({
        type: "group.rename",
        id: group.id,
        name: "  Northern supply  ",
      });
      expect(
        productionRegions(editor.getState().document).find(
          (candidate) => candidate.id === group.id,
        )?.name,
      ).toBe("Northern supply");
      const renamed = editor.getState().document;
      expect(renamed.nodes).toEqual(source.nodes);
      expect(renamed.materialLinks).toEqual(source.materialLinks);
      expect(
        parseCanvasPlanDocument(serializeCanvasPlanDocument(renamed)),
      ).toEqual(renamed);
      if (source !== basic) {
        const persisted = detailedDocumentFromEditor(renamed, detailed.tiers);
        const restored = parseCanvasPlanDocument(
          serializeCanvasPlanDocument(persisted),
        );
        if (restored.kind !== "detailed") throw new Error("Expected detailed");
        expect(detailedDocumentToEditor(restored)).toEqual(renamed);
      }
      editor.dispatch({ type: "history.undo" });
      expect(editor.getState().document.groupNames?.[group.id]).toBeUndefined();
      editor.dispatch({ type: "history.redo" });
      expect(editor.getState().document).toEqual(renamed);
      editor.dispatch({ type: "group.rename", id: group.id, name: "" });
      expect(editor.getState().document.groupNames?.[group.id]).toBeUndefined();
      editor.dispatch({
        type: "selection.node",
        id: group.nodeIds[0]!,
        additive: false,
      });
      expect(editor.getState().selectedGroupId).toBeUndefined();
    }
  }
}, 20000);
it("rejects malformed saved group names and accepts older saves", () => {
  expect(parseGroupNames(undefined)).toBeUndefined();
  for (const value of [
    [],
    12,
    null,
    { id: 10 },
    { id: " " },
    { id: "a".repeat(161) },
  ])
    expect(() => parseGroupNames(value)).toThrow();
  expect(parseGroupNames({ id: "North" })).toEqual({ id: "North" });
});

it("does not expose groups or accept group selection in Basic mode", async () => {
  const document = await arrangeCanvas(modularFrameFactory(false), new ELK());
  const group = productionRegions(document, "physical")[0]!;
  expect(productionRegions(document, "aggregate")).toEqual([]);
  const editor = createCanvasEditor({ document });
  editor.dispatch({ type: "selection.group", id: group.id });
  expect(editor.getState().selectedGroupId).toBeUndefined();
  expect(editor.getState().selectedIds).toEqual([]);
  editor.dispatch({ type: "group.rename", id: group.id, name: "Hidden group" });
  expect(editor.getState().document).toBe(document);
});
