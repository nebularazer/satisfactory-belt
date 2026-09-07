import { describe, expect, it } from "vitest";

import { CANVAS_DOCUMENT_VERSION, type CanvasDocument } from "./document";
import { materializeDetailedCanvas } from "./editor-mode";
import {
  parseCanvasPlanDocument,
  serializeCanvasPlanDocument,
} from "./plan-document-format";

const basic: CanvasDocument = {
  kind: "basic",
  materialLinks: [],
  nodes: [],
  version: CANVAS_DOCUMENT_VERSION,
};

describe("Plan Kind document format", () => {
  it("round-trips Basic and Detailed canvas documents through one interface", () => {
    const detailed = materializeDetailedCanvas(basic);

    expect(parseCanvasPlanDocument(serializeCanvasPlanDocument(basic))).toEqual(
      basic,
    );
    expect(
      parseCanvasPlanDocument(serializeCanvasPlanDocument(detailed)),
    ).toEqual(detailed);
  });
});
