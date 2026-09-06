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
        from: {
          nodeLabel: "Iron Ingot",
          portLabel: "Output · Iron Ingot",
        },
        id: "ingots",
        itemName: "Iron Ingot",
        label: "30",
        ratePerMinute: 30,
        state: "balanced",
        to: {
          nodeLabel: "Iron Plate",
          portLabel: "Input · Iron Ingot",
        },
        unit: "items/min",
      }),
    ]);
  });

  it("uses card titles and exposes an undersupplied state", () => {
    let id = 0;
    const editor = createCanvasEditor({ idFactory: () => `node-${++id}` });
    editor.dispatch({
      type: "node.create",
      at: { x: 0, y: 0 },
      label: "Iron Ore",
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    editor.dispatch({
      type: "node.create",
      at: { x: 400, y: 0 },
      label: "Iron Ingot",
      node: {
        buildableId: "Build_SmelterMk1_C",
        instances: Array.from({ length: 7 }, (_, index) => ({
          id: `smelter-${index + 1}`,
        })),
        kind: "process",
        processId: "Recipe_IngotIron_C",
      },
    });
    editor.dispatch({
      type: "link.create",
      from: { nodeId: "node-1", portId: "output:Desc_OreIron_C" },
      id: "ore",
      to: { nodeId: "node-2", portId: "input:Desc_OreIron_C" },
    });

    expect(presentMaterialLinks(editor.getState().document)).toEqual([
      expect.objectContaining({
        from: {
          nodeLabel: "Iron Ore Extraction",
          portLabel: "Output · Iron Ore",
        },
        label: "60",
        state: "shortage",
        to: {
          nodeLabel: "Iron Ingot",
          portLabel: "Input · Iron Ore",
        },
      }),
    ]);
  });
});
