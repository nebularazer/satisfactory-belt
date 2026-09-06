import { describe, expect, it } from "vitest";

import type { CanvasDocument } from "./document";
import { createCanvasEditor } from "./editor";
import { presentMaterialLinks } from "./material-link-presentation";

describe("Material Link presentation", () => {
  it("formats the implicit per-minute canvas label and inspector details", () => {
    let id = 0;
    const editor = createCanvasEditor({ idFactory: () => `id-${++id}` });
    editor.dispatch({
      type: "node.create",
      at: { x: 0, y: 0 },
      label: "Smelter",
      node: {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      },
    });
    editor.dispatch({
      type: "node.create",
      at: { x: 400, y: 0 },
      label: "Constructor",
      node: {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      },
    });
    editor.dispatch({
      type: "link.create",
      from: { nodeId: "id-1", portId: "output:Desc_IronIngot_C" },
      id: "ingots",
      to: { nodeId: "id-2", portId: "input:Desc_IronIngot_C" },
    });

    expect(
      presentMaterialLinks(editor.getState().document as CanvasDocument),
    ).toEqual([
      expect.objectContaining({
        from: expect.objectContaining({ nodeLabel: "Smelter" }),
        id: "ingots",
        itemName: "Iron Ingot",
        label: "30",
        ratePerMinute: 30,
        to: expect.objectContaining({ nodeLabel: "Constructor" }),
        unit: "items/min",
      }),
    ]);
  });
});
