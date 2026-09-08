import { describe, expect, it } from "vitest";
import { analyzeDetailedPlan } from "@satisfactory-belt/planning";

import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
  materializeDetailedCanvas,
} from "./editor-mode";
import { createCanvasEditor } from "./editor";
import { modularFrameFactory } from "./modular-frame-fixture";

describe("Basic and Detailed editor modes", () => {
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
