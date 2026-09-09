import { expect, it } from "vitest";
import { createCanvasEditor } from "./editor";
import { modularFrameFactory } from "./modular-frame-fixture";
import { selectionFocus } from "./selection-focus";

const document = modularFrameFactory(false);
const state = createCanvasEditor({ document }).getState();

it("keeps only the selected node, incident links and immediate neighbors clear", () => {
  const focus = selectionFocus({ ...state, selectedIds: ["plates"] })!;
  expect(focus.nodeIds).toEqual(
    new Set(["plates", "smelters", "reinforced-plates"]),
  );
  expect(focus.linkIds).toEqual(new Set(["plate-ingots", "plates"]));
  // Even a link between highlighted neighbors must not expand the selection.
  const cyclic = selectionFocus({
    ...state,
    selectedIds: ["plates"],
    document: {
      ...document,
      materialLinks: [
        ...document.materialLinks,
        {
          id: "return",
          from: { nodeId: "reinforced-plates", portId: "output:1" },
          to: { nodeId: "smelters", portId: "input:1" },
        },
      ],
    },
  });
  expect(cyclic).toEqual(focus);
});

it("a selected link highlights only itself and its endpoints", () => {
  const focus = selectionFocus({ ...state, selectedLinkIds: ["plates"] })!;
  expect(focus.nodeIds).toEqual(new Set(["plates", "reinforced-plates"]));
  expect(focus.linkIds).toEqual(new Set(["plates"]));
});

it("combines group members, multiple nodes and explicitly selected links without cascading", () => {
  const focus = selectionFocus({
    ...state,
    selectedIds: ["plates", "screws"],
    selectedLinkIds: ["rods"],
  })!;
  expect(focus.nodeIds).toEqual(
    new Set([
      "plates",
      "screws",
      "smelters",
      "reinforced-plates",
      "rods",
      "frames",
    ]),
  );
  expect(focus.linkIds).toEqual(
    new Set(["plates", "screws", "plate-ingots", "screw-ingots", "rods"]),
  );
});

it("restores full visibility when selection clears or a connection is being drawn", () => {
  expect(selectionFocus(state)).toBeUndefined();
  const editor = createCanvasEditor({ document });
  editor.dispatch({ type: "selection.node", id: "plates", additive: false });
  expect(selectionFocus(editor.getState())).toBeDefined();
  editor.dispatch({
    type: "link.preview",
    current: { x: 100, y: 100 },
    from: { nodeId: "plates", portId: "output:Desc_IronPlate_C" },
  });
  expect(editor.getState().connectionPreview).toBeDefined();
  expect(selectionFocus(editor.getState())).toBeUndefined();
});
