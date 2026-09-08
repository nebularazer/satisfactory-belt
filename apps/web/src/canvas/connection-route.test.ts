import { describe, expect, it } from "vitest";
import { parseConnectionRoute } from "./connection-route";
import { modularFrameFactory } from "./modular-frame-fixture";
import { materializeDetailedCanvas } from "./editor-mode";
import { validateDetailedCanvasDocument } from "@/detailed-canvas/document";
import { validateCanvasDocument } from "./document-format";

describe("Canvas connection routes", () => {
  it.each([
    null,
    [],
    [{ x: 0, y: 0 }],
    [
      { x: 0, y: 0 },
      { x: Infinity, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: "1" },
    ],
  ])("rejects malformed route %j", (route) => {
    expect(() => parseConnectionRoute(route)).toThrow();
    const basic = modularFrameFactory(false);
    expect(() =>
      validateCanvasDocument({
        ...basic,
        materialLinks: basic.materialLinks.map((link) => ({ ...link, route })),
      }),
    ).toThrow();
  });

  it("rejects Detailed routes for unknown connections", () => {
    const detailed = materializeDetailedCanvas(modularFrameFactory(false));
    expect(() =>
      validateDetailedCanvasDocument({
        ...detailed,
        connectionRoutes: {
          unknown: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      }),
    ).toThrow("unknown connection");
  });
});
