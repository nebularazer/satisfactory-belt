import { describe, expect, it } from "vitest";

import {
  canvasDocumentForConnection,
  compatibleTemplatePortIds,
} from "./connection-compatibility";
import { createCanvasEditor } from "./editor";

describe("canvas connection compatibility", () => {
  it("limits a dropped output to Nodes with a compatible input", () => {
    const editor = createCanvasEditor({ idFactory: () => "miner" });
    editor.dispatch({
      type: "node.create",
      at: { x: 0, y: 0 },
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    const document = editor.getState().document;
    const source = {
      nodeId: "miner",
      portId: "output:Desc_OreIron_C",
    };

    expect(
      compatibleTemplatePortIds(document, source, {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      }),
    ).toEqual(["input:Desc_OreIron_C"]);
    expect(
      compatibleTemplatePortIds(document, source, {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      }),
    ).toEqual([]);
  });

  it("offers only recipes that can consume a smelter output", () => {
    const editor = createCanvasEditor({ idFactory: () => "smelter" });
    editor.dispatch({
      type: "node.create",
      at: { x: 0, y: 0 },
      node: {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      },
    });
    const document = editor.getState().document;
    const source = {
      nodeId: "smelter",
      portId: "output:Desc_IronIngot_C",
    };

    expect(
      compatibleTemplatePortIds(document, source, {
        buildableId: "Build_ConstructorMk1_C",
        kind: "process",
        processId: "Recipe_IronPlate_C",
      }),
    ).toEqual(["input:Desc_IronIngot_C"]);
    expect(
      compatibleTemplatePortIds(document, source, {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      }),
    ).toEqual([]);
  });

  it("evaluates a reconnect as if the existing link were detached", () => {
    let id = 0;
    const editor = createCanvasEditor({ idFactory: () => `node-${++id}` });
    editor.dispatch({
      type: "node.create",
      at: { x: 0, y: 0 },
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    editor.dispatch({
      type: "node.create",
      at: { x: 400, y: 0 },
      node: {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      },
    });
    editor.dispatch({
      type: "link.create",
      from: { nodeId: "node-1", portId: "output:Desc_OreIron_C" },
      to: { nodeId: "node-2", portId: "input:Desc_OreIron_C" },
    });
    const document = editor.getState().document;
    const linkId = document.materialLinks[0]?.id;
    expect(linkId).toBeDefined();
    const source = {
      nodeId: "node-1",
      portId: "output:Desc_OreIron_C",
    };
    const candidate = {
      buildableId: "Build_SmelterMk1_C",
      kind: "process" as const,
      processId: "Recipe_IngotIron_C",
    };

    expect(compatibleTemplatePortIds(document, source, candidate)).toEqual([
      "input:Desc_OreIron_C",
    ]);
    expect(
      compatibleTemplatePortIds(
        canvasDocumentForConnection(document, linkId),
        source,
        candidate,
      ),
    ).toEqual(["input:Desc_OreIron_C"]);
  });
});
