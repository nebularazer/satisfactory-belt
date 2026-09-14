import { describe, expect, it, vi } from "vitest";

import { CanvasController, commandForKey } from "./controller";
import type { CanvasItem, CanvasPointer } from "./controller";
import { fitCamera, MAX_ZOOM, MIN_ZOOM, screenToWorld, worldToScreen, zoomAt } from "./geometry";

const items = [
  { id: "a", x: 100, y: 100, width: 100, height: 80, text: "A" },
  { id: "b", x: 250, y: 100, width: 100, height: 80, text: "B" },
] as const satisfies readonly CanvasItem[];
const pointer = (x: number, y: number, extra: Partial<CanvasPointer> = {}): CanvasPointer => ({
  id: 1,
  x,
  y,
  ...extra,
});

function setup() {
  const onMove = vi.fn();
  const canvas = new CanvasController({ items, onMove });
  canvas.resize({ width: 800, height: 600 });
  return { canvas, onMove };
}

function click(canvas: CanvasController, point: CanvasPointer) {
  canvas.pointerDown(point);
  canvas.pointerUp(point);
}
function drag(canvas: CanvasController, start: CanvasPointer, end: CanvasPointer) {
  canvas.pointerDown(start);
  canvas.pointerMove(end);
  canvas.pointerUp(end);
}

describe("camera", () => {
  it("preserves the world point under the zoom anchor, including zoom limits", () => {
    const camera = { x: -270, y: 94, zoom: 0.4 };
    const anchor = { x: 325, y: 218 };
    const before = screenToWorld(anchor, camera);
    expect(worldToScreen(before, camera)).toEqual(anchor);
    for (const zoom of [0.001, 0.7, 3, 100]) {
      const next = zoomAt(camera, anchor, zoom);
      const after = screenToWorld(anchor, next);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      expect(next.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(next.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it("fits negative and positive coordinates with padding, and resets an empty scene", () => {
    const bounds = [
      { x: -400, y: -100, width: 500, height: 200 },
      { x: 300, y: 200, width: 100, height: 100 },
    ];
    const camera = fitCamera(bounds, { width: 800, height: 600 });
    const topLeft = worldToScreen({ x: -400, y: -100 }, camera);
    const bottomRight = worldToScreen({ x: 400, y: 300 }, camera);
    expect(topLeft.x).toBeCloseTo(64);
    expect(bottomRight.x).toBeCloseTo(736);
    expect(topLeft.y).toBeGreaterThanOrEqual(64);
    expect(bottomRight.y).toBeLessThanOrEqual(536);
    expect(fitCamera([], { width: 800, height: 600 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("preserves the viewport center on resize and actual-size zoom", () => {
    const { canvas } = setup();
    canvas.command("fit");
    const before = screenToWorld({ x: 400, y: 300 }, canvas.getSnapshot().camera);
    canvas.resize({ width: 1000, height: 700 });
    canvas.command("actual-size");
    expect(screenToWorld({ x: 500, y: 350 }, canvas.getSnapshot().camera)).toEqual(before);
    canvas.command("reset");
    expect(canvas.getSnapshot().camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("pointer interactions", () => {
  it("pans empty space with primary drag without moving or clearing selected items", () => {
    const { canvas, onMove } = setup();
    click(canvas, pointer(120, 120));
    drag(canvas, pointer(400, 400), pointer(450, 430));
    expect(canvas.getSnapshot().camera).toEqual({ x: 50, y: 30, zoom: 1 });
    expect([...canvas.getSnapshot().selection]).toEqual(["a"]);
    expect(onMove).not.toHaveBeenCalled();
    click(canvas, pointer(500, 500));
    expect(canvas.getSnapshot().selection.size).toBe(0);
  });

  it("treats small motion as a click and picks the topmost overlapping item", () => {
    const { canvas, onMove } = setup();
    canvas.setItems([...items, { ...items[0], id: "top" }]);
    drag(canvas, pointer(120, 120), pointer(122, 121));
    expect([...canvas.getSnapshot().selection]).toEqual(["top"]);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("previews group movement in world units and commits only on release", () => {
    const { canvas, onMove } = setup();
    click(canvas, pointer(120, 120));
    click(canvas, pointer(270, 120, { additive: true }));
    canvas.zoomTo(2, { x: 0, y: 0 });
    canvas.pointerDown(pointer(240, 240));
    canvas.pointerMove(pointer(280, 260));
    expect(canvas.getSnapshot().dragOffset).toEqual({ x: 20, y: 10 });
    expect(canvas.getSnapshot().items).toEqual(items);
    expect(onMove).not.toHaveBeenCalled();
    canvas.pointerUp(pointer(280, 260));
    expect(onMove).toHaveBeenCalledExactlyOnceWith([
      { id: "a", x: 120, y: 110 },
      { id: "b", x: 270, y: 110 },
    ]);
    expect(canvas.getSnapshot().dragOffset).toEqual({ x: 0, y: 0 });
  });

  it("toggles membership with additive clicks", () => {
    const { canvas } = setup();
    click(canvas, pointer(120, 120));
    click(canvas, pointer(270, 120, { additive: true }));
    click(canvas, pointer(120, 120, { additive: true }));
    expect([...canvas.getSnapshot().selection]).toEqual(["b"]);
  });

  it("prioritizes modifier marquee over item dragging in either direction", () => {
    const { canvas, onMove } = setup();
    canvas.pointerDown(pointer(320, 150, { marquee: true }));
    canvas.pointerMove(pointer(90, 90));
    expect(canvas.getSnapshot().marquee).toEqual({ x: 90, y: 90, width: 230, height: 60 });
    expect([...canvas.getSnapshot().selection]).toEqual(["a", "b"]);
    canvas.pointerUp(pointer(90, 90));
    expect(onMove).not.toHaveBeenCalled();
    expect(canvas.getSnapshot().camera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("supports additive marquee without retaining stale preview hits", () => {
    const { canvas } = setup();
    click(canvas, pointer(120, 120));
    canvas.pointerDown(pointer(240, 90, { marquee: true, additive: true }));
    canvas.pointerMove(pointer(360, 190));
    expect([...canvas.getSnapshot().selection]).toEqual(["a", "b"]);
    canvas.pointerMove(pointer(245, 95));
    expect([...canvas.getSnapshot().selection]).toEqual(["a"]);
  });

  it.each(["pan", "drag", "marquee"] as const)(
    "rolls back %s on Escape and ignores the old pointer",
    (kind) => {
      const { canvas, onMove } = setup();
      click(canvas, pointer(270, 120));
      const before = canvas.getSnapshot();
      canvas.pointerDown(
        kind === "pan" ? pointer(500, 400) : pointer(120, 120, { marquee: kind === "marquee" }),
      );
      canvas.pointerMove(pointer(600, 450));
      canvas.command("escape");
      canvas.pointerMove(pointer(650, 480));
      canvas.pointerUp(pointer(650, 480));
      expect(canvas.getSnapshot().camera).toEqual(before.camera);
      expect(canvas.getSnapshot().selection).toEqual(before.selection);
      expect(canvas.getSnapshot().interaction).toBe("idle");
      expect(onMove).not.toHaveBeenCalled();
    },
  );

  it("prunes removed items and cancels a preview when the host replaces geometry", () => {
    const { canvas, onMove } = setup();
    click(canvas, pointer(120, 120));
    canvas.pointerDown(pointer(120, 120));
    canvas.pointerMove(pointer(140, 140));
    canvas.setItems([items[1]]);
    canvas.pointerUp(pointer(140, 140));
    expect(canvas.getSnapshot().selection.size).toBe(0);
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("touch gestures", () => {
  it("rolls a drag back on second touch, anchors pinch, and waits for all fingers to release", () => {
    const { canvas, onMove } = setup();
    const first = (x: number, y: number) => pointer(x, y, { touch: true });
    const second = (x: number, y: number) => pointer(x, y, { id: 2, touch: true });
    canvas.pointerDown(first(120, 120));
    canvas.pointerMove(first(150, 120));
    canvas.pointerDown(second(250, 120));
    expect(canvas.getSnapshot().dragOffset).toEqual({ x: 0, y: 0 });
    expect(canvas.getSnapshot().selection.size).toBe(0);
    canvas.pointerMove(second(350, 120));
    const camera = canvas.getSnapshot().camera;
    expect(camera.zoom).toBe(2);
    expect(worldToScreen({ x: 200, y: 120 }, camera)).toEqual({ x: 250, y: 120 });
    canvas.pointerUp(second(350, 120));
    canvas.pointerMove(first(300, 400));
    expect(canvas.getSnapshot().camera).toEqual(camera);
    canvas.pointerUp(first(300, 400));
    expect(onMove).not.toHaveBeenCalled();
    drag(canvas, first(500, 400), first(520, 400));
    expect(canvas.getSnapshot().camera.x).toBe(camera.x + 20);
  });

  it("ignores a third finger and rolls back a cancelled pinch", () => {
    const { canvas } = setup();
    canvas.pointerDown(pointer(400, 400, { touch: true }));
    canvas.pointerDown(pointer(500, 400, { id: 2, touch: true }));
    canvas.pointerDown(pointer(600, 400, { id: 3, touch: true }));
    canvas.pointerUp(pointer(600, 400, { id: 3, touch: true }));
    expect(canvas.getSnapshot().interaction).toBe("pinch");
    canvas.pointerMove(pointer(600, 400, { id: 2, touch: true }));
    canvas.cancel();
    expect(canvas.getSnapshot().camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(canvas.getSnapshot().interaction).toBe("idle");
  });
});

it("maps view shortcuts without hijacking browser modifier shortcuts", () => {
  const key = {
    key: "=",
    code: "Equal",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  expect(commandForKey(key)).toBe("zoom-in");
  expect(commandForKey({ ...key, key: "-" })).toBe("zoom-out");
  expect(commandForKey({ ...key, key: "0" })).toBe("reset");
  expect(commandForKey({ ...key, key: "!", code: "Digit1", shiftKey: true })).toBe("fit");
  expect(commandForKey({ ...key, ctrlKey: true })).toBeUndefined();
  expect(commandForKey({ ...key, metaKey: true })).toBeUndefined();
});
