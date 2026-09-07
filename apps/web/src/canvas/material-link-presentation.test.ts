import { createNode } from "@satisfactory-belt/production";
import { describe, expect, it } from "vitest";

import type { CanvasDocument } from "./document";
import { createCanvasEditor } from "./editor";
import {
  presentMaterialFlow,
  presentMaterialLinks,
} from "./material-link-presentation";

function documentNode(request: Parameters<typeof createNode>[0], x: number) {
  const configuration = createNode(request).configuration;
  return {
    configuration,
    height: 320,
    label: configuration.id,
    width: 320,
    x,
    y: 0,
  };
}

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

  it("shares terminal Router inference between links and ports", () => {
    let id = 0;
    const editor = createCanvasEditor({ idFactory: () => `node-${++id}` });
    editor.dispatch({
      type: "node.create",
      at: { x: 0, y: 0 },
      node: {
        buildableId: "Build_SmelterMk1_C",
        kind: "process",
        processId: "Recipe_IngotIron_C",
      },
    });
    editor.dispatch({
      type: "node.create",
      at: { x: 400, y: 0 },
      node: {
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        kind: "router",
      },
    });
    editor.dispatch({
      type: "link.create",
      from: { nodeId: "node-1", portId: "output:Desc_IronIngot_C" },
      id: "into-splitter",
      to: { nodeId: "node-2", portId: "input:1" },
    });

    const presentation = presentMaterialFlow(editor.getState().document);
    expect(presentation.links[0]).toMatchObject({
      itemName: "Iron Ingot",
      label: "30",
      ratePerMinute: 30,
    });
    expect(presentation.port({ nodeId: "node-2", portId: "input:1" })).toEqual({
      itemId: "Desc_IronIngot_C",
      ratePerMinute: 30,
    });
    expect(presentation.port({ nodeId: "node-2", portId: "output:1" })).toEqual(
      { itemId: "Desc_IronIngot_C", ratePerMinute: 10 },
    );
  });

  it("presents parallel Splitter-to-Merger links as resolved", () => {
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
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        kind: "router",
      },
    });
    editor.dispatch({
      type: "node.create",
      at: { x: 800, y: 0 },
      node: {
        buildableId: "Build_ConveyorAttachmentMerger_C",
        kind: "router",
      },
    });
    editor.dispatch({
      type: "link.create",
      from: { nodeId: "node-1", portId: "output:Desc_OreIron_C" },
      id: "into-splitter",
      to: { nodeId: "node-2", portId: "input:1" },
    });
    for (const index of [1, 2, 3]) {
      editor.dispatch({
        type: "link.create",
        from: { nodeId: "node-2", portId: `output:${index}` },
        id: `parallel-${index}`,
        to: { nodeId: "node-3", portId: `input:${index}` },
      });
    }

    const presentation = presentMaterialFlow(editor.getState().document);
    expect(
      presentation.links
        .filter(({ id }) => id.startsWith("parallel-"))
        .map(({ diagnostics, label, ratePerMinute, state }) => ({
          diagnostics: diagnostics.map(({ code }) => code),
          label,
          ratePerMinute,
          state,
        })),
    ).toEqual([
      {
        diagnostics: ["basic.network.surplus"],
        label: "20",
        ratePerMinute: 20,
        state: "surplus",
      },
      {
        diagnostics: ["basic.network.surplus"],
        label: "20",
        ratePerMinute: 20,
        state: "surplus",
      },
      {
        diagnostics: ["basic.network.surplus"],
        label: "20",
        ratePerMinute: 20,
        state: "surplus",
      },
    ]);
    expect(presentation.port({ nodeId: "node-3", portId: "output:1" })).toEqual(
      { itemId: "Desc_OreIron_C", ratePerMinute: 60 },
    );
  });

  it("presents a determinate feedback loop with numeric link rates", () => {
    const document: CanvasDocument = {
      kind: "basic",
      materialLinks: [
        {
          from: { nodeId: "miner", portId: "output:Desc_OreIron_C" },
          id: "source",
          to: { nodeId: "splitter-one", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter-one", portId: "output:1" },
          id: "first-storage",
          to: { nodeId: "storage-one", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter-one", portId: "output:3" },
          id: "fresh",
          to: { nodeId: "merger", portId: "input:1" },
        },
        {
          from: { nodeId: "merger", portId: "output:1" },
          id: "merged",
          to: { nodeId: "splitter-two", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter-two", portId: "output:1" },
          id: "second-storage",
          to: { nodeId: "storage-two", portId: "input:1" },
        },
        {
          from: { nodeId: "splitter-two", portId: "output:3" },
          id: "feedback",
          to: { nodeId: "merger", portId: "input:3" },
        },
      ],
      nodes: [
        documentNode(
          {
            buildableId: "Build_MinerMk1_C",
            id: "miner",
            kind: "process",
            processId: "extraction:Desc_OreIron_C",
          },
          0,
        ),
        documentNode(
          {
            buildableId: "Build_ConveyorAttachmentSplitter_C",
            id: "splitter-one",
            kind: "router",
          },
          400,
        ),
        documentNode(
          {
            buildableId: "Build_StorageContainerMk1_C",
            id: "storage-one",
            kind: "buffer",
          },
          800,
        ),
        documentNode(
          {
            buildableId: "Build_ConveyorAttachmentMerger_C",
            id: "merger",
            kind: "router",
          },
          800,
        ),
        documentNode(
          {
            buildableId: "Build_ConveyorAttachmentSplitter_C",
            id: "splitter-two",
            kind: "router",
          },
          1_200,
        ),
        documentNode(
          {
            buildableId: "Build_StorageContainerMk1_C",
            id: "storage-two",
            kind: "buffer",
          },
          1_600,
        ),
      ],
      version: 4,
    };

    const presentation = presentMaterialFlow(document);
    expect(
      Object.fromEntries(
        presentation.links.map(({ id, label, ratePerMinute }) => [
          id,
          { label, ratePerMinute },
        ]),
      ),
    ).toEqual({
      feedback: { label: "30", ratePerMinute: 30 },
      "first-storage": { label: "30", ratePerMinute: 30 },
      fresh: { label: "30", ratePerMinute: 30 },
      merged: { label: "60", ratePerMinute: 60 },
      "second-storage": { label: "30", ratePerMinute: 30 },
      source: { label: "60", ratePerMinute: 60 },
    });
    expect(
      presentation.links.some(({ diagnostics }) =>
        diagnostics.some(({ code }) => code === "basic.network.feedback"),
      ),
    ).toBe(false);
  });
});
