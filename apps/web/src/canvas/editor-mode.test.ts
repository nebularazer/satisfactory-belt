import { describe, expect, it } from "vitest";

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
      expect(detailedDocumentFromEditor(projection, detailed.tiers)).toEqual(
        detailed,
      );
      expect(
        detailed.nodes.some(
          ({ configuration }) => configuration.id === "ingot-splitter",
        ),
      ).toBe(withSplitter);
    },
  );
});
