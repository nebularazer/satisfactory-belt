import { describe, expect, it } from "vitest";

import { compatibleTemplatePortIds } from "./connection-compatibility";
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
});
