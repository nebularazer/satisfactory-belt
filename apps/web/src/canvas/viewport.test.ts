import { describe, expect, it } from "vitest";

import {
  fitRectangleInViewport,
  MAX_ZOOM,
  MIN_ZOOM,
  panViewport,
  screenToWorld,
  zoomViewportAt,
  type Viewport,
} from "./viewport";

const viewport: Viewport = { x: 100, y: 50, zoom: 2 };

describe("viewport", () => {
  it("pans in screen space", () => {
    expect(panViewport(viewport, { x: -20, y: 10 })).toEqual({
      x: 80,
      y: 60,
      zoom: 2,
    });
  });

  it("converts screen coordinates into world coordinates", () => {
    expect(screenToWorld({ x: 140, y: 90 }, viewport)).toEqual({
      x: 20,
      y: 20,
    });
  });

  it("keeps the world point under the zoom anchor stationary", () => {
    const anchor = { x: 140, y: 90 };
    const before = screenToWorld(anchor, viewport);
    const zoomed = zoomViewportAt(viewport, 3, anchor);

    expect(screenToWorld(anchor, zoomed)).toEqual(before);
    expect(zoomed.zoom).toBe(3);
  });

  it("clamps zoom to the supported range", () => {
    expect(zoomViewportAt(viewport, 0, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
    expect(zoomViewportAt(viewport, 10, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it("fits a world rectangle into the screen with padding", () => {
    const fitted = fitRectangleInViewport(
      { height: 400, width: 800, x: 100, y: 200 },
      { height: 600, width: 1_000 },
    );

    expect(fitted).toEqual({ x: 0, y: -100, zoom: 1 });
  });

  it("limits selection fitting to the requested zoom", () => {
    expect(
      fitRectangleInViewport(
        { height: 10, width: 10, x: 0, y: 0 },
        { height: 600, width: 1_000 },
        2,
      ).zoom,
    ).toBe(2);
  });
});
