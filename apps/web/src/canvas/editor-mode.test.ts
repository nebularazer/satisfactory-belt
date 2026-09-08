import { describe, expect, it } from "vitest";
import {
  analyzeDetailedPlan,
  DEFAULT_LOGISTICS_TIERS,
} from "@satisfactory-belt/planning";

import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
  materializeDetailedCanvas,
} from "./editor-mode";
import { createCanvasEditor } from "./editor";
import { modularFrameFactory } from "./modular-frame-fixture";

describe("Basic and Detailed editor modes", () => {
  it.each([
    {
      medium: "conveyor",
      source: "Build_MinerMk1_C",
      sourceProcess: "extraction:Desc_OreIron_C",
      target: "Build_SmelterMk1_C",
      targetProcess: "Recipe_IngotIron_C",
      item: "Desc_OreIron_C",
    },
    {
      medium: "pipeline",
      source: "Build_WaterPump_C",
      sourceProcess: "extraction:Desc_Water_C",
      target: "Build_OilRefinery_C",
      targetProcess: "Recipe_AluminaSolution_C",
      item: "Desc_Water_C",
    },
  ])(
    "starts manual $medium links at Mk.1 and permits upgrades beyond old conversion limits",
    ({ medium, source, sourceProcess, target, targetProcess, item }) => {
      const tiers = DEFAULT_LOGISTICS_TIERS.filter(
        (tier) => tier.id === `${medium}-mk1`,
      );
      let id = 0;
      const editor = createCanvasEditor({
        topology: "physical",
        logisticsTiers: tiers,
        idFactory: () => `node-${++id}`,
      });
      editor.dispatch({
        type: "node.create",
        at: { x: 0, y: 0 },
        node: {
          kind: "process",
          buildableId: source,
          processId: sourceProcess,
        },
      });
      editor.dispatch({
        type: "node.create",
        at: { x: 500, y: 0 },
        node: {
          kind: "process",
          buildableId: target,
          processId: targetProcess,
        },
      });
      const connection = {
        type: "link.create" as const,
        id: "manual",
        from: { nodeId: "node-1", portId: `output:${item}` },
        to: { nodeId: "node-2", portId: `input:${item}` },
      };
      editor.dispatch(connection);
      editor.dispatch({ type: "link.delete", id: "manual" });
      editor.dispatch(connection);
      expect(
        editor.getState().document.materialLinks[0]?.logistics?.tierId,
      ).toBe(`${medium}-mk1`);
      editor.dispatch({
        type: "link.tier",
        id: "manual",
        tierId: `${medium}-mk2`,
      });
      expect(editor.getState().connectionError).toBeUndefined();
      const detailed = detailedDocumentFromEditor(
        editor.getState().document,
        editor.logisticsTiers,
      );
      expect(detailed.connections[0]?.tierId).toBe(`${medium}-mk2`);
      editor.dispatch({ type: "history.undo" });
      expect(
        editor.getState().document.materialLinks[0]?.logistics?.tierId,
      ).toBe(`${medium}-mk1`);
      editor.dispatch({ type: "history.redo" });
      expect(
        detailedDocumentFromEditor(
          editor.getState().document,
          editor.logisticsTiers,
        ),
      ).toEqual(detailed);
    },
  );

  it("adds missing standard tiers while preserving saved custom definitions", () => {
    const custom = {
      id: "custom-conveyor",
      medium: "conveyor" as const,
      capacityPerMinute: 777,
    };
    const editor = createCanvasEditor({
      topology: "physical",
      logisticsTiers: [custom],
    });
    expect(editor.logisticsTiers).toEqual([custom, ...DEFAULT_LOGISTICS_TIERS]);
  });

  it.each([true, false])(
    "materializes the example factory with splitter=%s into singular physical Nodes",
    (withSplitter) => {
      const basic = modularFrameFactory(withSplitter);
      const detailed = materializeDetailedCanvas(basic);
      const projection = detailedDocumentToEditor(detailed);
      const editor = createCanvasEditor({
        document: projection,
        topology: "physical",
      });

      expect(
        detailed.nodes.filter(
          ({ configuration }) => configuration.kind === "process",
        ),
      ).toHaveLength(65);
      expect(
        detailed.nodes
          .filter(({ configuration }) => configuration.kind === "process")
          .every(
            ({ configuration }) =>
              configuration.kind === "process" &&
              configuration.instances.length === 1,
          ),
      ).toBe(true);
      expect(detailed.connections.length).toBeGreaterThan(
        basic.materialLinks.length,
      );
      expect(editor.topology).toBe("physical");
      expect(editor.getState().document).toBe(projection);
      expect(detailed.kind).toBe("detailed");
      const analysis = analyzeDetailedPlan(detailed);
      for (const node of detailed.nodes) {
        if (
          node.configuration.buildableId !==
          "Build_ConveyorAttachmentSplitter_C"
        )
          continue;
        const outputs = detailed.connections.filter(
          (link) => link.from.nodeId === node.configuration.id,
        );
        const rates = outputs.map(
          (link) =>
            analysis.connectionFlows.find(
              (flow) => flow.connectionId === link.id,
            )?.ratePerMinute,
        );
        expect(rates.length).toBeGreaterThan(1);
        for (const rate of rates) expect(rate).toBeCloseTo(rates[0]!, 6);
      }
      expect(
        Object.values(analysis.machineEfficiency).every(
          (efficiency) => efficiency > 1 - 1e-7,
        ),
      ).toBe(true);
      expect(
        analysis.diagnostics.filter(
          (diagnostic) => diagnostic.code === "detailed.connection.overload",
        ),
      ).toEqual([]);
      expect(detailedDocumentFromEditor(projection, detailed.tiers)).toEqual(
        detailed,
      );
      expect(
        detailed.nodes.some(
          ({ configuration }) => configuration.id === "ingot-splitter",
        ),
      ).toBe(withSplitter);
    },
    // Expands 65 machines, solves all balancer flows, and checks persistence.
    15_000,
  );
});
