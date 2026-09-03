import { describe, expect, it } from "vitest";

import {
  parseCanvasDocument,
  serializeCanvasDocument,
  validateCanvasDocument,
} from "./document-format";

const document = {
  nodes: [
    {
      height: 96,
      id: "node-1",
      label: "Node 1",
      width: 176,
      x: 0,
      y: 32,
    },
  ],
  version: 1 as const,
};

describe("canvas document format", () => {
  it("round-trips the current document version", () => {
    expect(parseCanvasDocument(serializeCanvasDocument(document))).toEqual(
      document,
    );
  });

  it("rejects unknown versions without attempting migration", () => {
    expect(() => validateCanvasDocument({ ...document, version: 2 })).toThrow(
      "Unsupported document version: 2.",
    );
  });

  it("rejects malformed and duplicate nodes", () => {
    expect(() => validateCanvasDocument({ nodes: [{}], version: 1 })).toThrow(
      "invalid id",
    );
    expect(() =>
      validateCanvasDocument({
        nodes: [document.nodes[0], document.nodes[0]],
        version: 1,
      }),
    ).toThrow("Node ids must be unique.");
  });
});
