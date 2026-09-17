import { expect, it, vi } from "vitest";

import { CanvasController } from "./controller";
import { hitTestPorts, portId } from "./ports";
import type { CanvasPort } from "./ports";
const ports: CanvasPort[] = [
  { nodeId: "a", portKey: "output:water", direction: "output", x: 100, y: 40, radius: 7 },
  { nodeId: "b", portKey: "input:water", direction: "input", x: 0, y: 40, radius: 7 },
  { nodeId: "b", portKey: "input:gas", direction: "input", x: 0, y: 72, radius: 7 },
];
const items = [
  { id: "a", x: 0, y: 0, width: 100, height: 100 },
  { id: "b", x: 200, y: 0, width: 100, height: 100 },
];
const pointer = (x: number, y = 40, touch = false, id = 1) => ({ x, y, touch, id });
function setup(connect = false) {
  const move = vi.fn();
  const onConnect = vi.fn(() => ({ compatible: true as const, output: ports[0], input: ports[1] }));
  const canvas = new CanvasController({
    items,
    onMove: move,
    onConnect: connect ? onConnect : undefined,
  });
  canvas.setPorts(
    ports,
    (a, b) =>
      a.portKey.endsWith("water") && b.portKey.endsWith("water")
        ? { compatible: true, output: ports[0], input: ports[1] }
        : { compatible: false, reason: "different-material" },
    () => [ports[1]],
  );
  return { canvas, move, onConnect };
}
function tap(canvas: CanvasController, p = pointer(100)) {
  canvas.pointerDown(p);
  canvas.pointerUp(p);
}
it("commits only on release, allows touch movement, never moves the node", () => {
  const { canvas, move } = setup();
  canvas.pointerDown(pointer(100, 40, true));
  expect(canvas.getPortSnapshot().anchor).toBeNull();
  expect(canvas.getPortSnapshot().pending).toHaveLength(1);
  canvas.pointerUp(pointer(105, 44, true));
  expect(canvas.getPortSnapshot().anchor).toMatchObject(ports[0]);
  expect([...canvas.getSnapshot().selection]).toEqual(["a"]);
  expect(move).not.toHaveBeenCalled();
});
it("port drags cancel on empty space without panning or keeping an anchor", () => {
  const { canvas, move, onConnect } = setup(true);
  tap(canvas);
  canvas.pointerDown(pointer(200, 40, true));
  canvas.pointerUp(pointer(240, 40, true));
  expect(canvas.getSnapshot().camera.x).toBe(0);
  expect(canvas.getPortSnapshot().anchor).toBeNull();
  expect(canvas.getSnapshot().connectionPreview).toBeNull();
  expect(move).not.toHaveBeenCalled();
  expect(onConnect).not.toHaveBeenCalled();
});
it.each([false, true])("drags a connection in either direction with touch=%s", (touch) => {
  for (const [start, end] of [
    [100, 200],
    [200, 100],
  ]) {
    const { canvas, move, onConnect } = setup(true);
    canvas.pointerDown(pointer(start, 40, touch));
    canvas.pointerMove(pointer(start + 2, 40, touch));
    expect(canvas.getSnapshot().connectionPreview).toBeNull();
    canvas.pointerMove(pointer(end, 40, touch));
    const points = canvas.getSnapshot().connectionPreview!;
    expect(points[0]).toEqual({ x: 100, y: 40 });
    expect(points.at(-1)).toEqual({ x: 200, y: 40 });
    expect(onConnect).not.toHaveBeenCalled();
    canvas.pointerUp(pointer(end, 40, touch));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
    expect(canvas.getSnapshot().connectionPreview).toBeNull();
    expect(canvas.getPortSnapshot().anchor).toBeNull();
  }
});
it("rejects an invalid drop with a forbidden cursor", () => {
  const { canvas, onConnect } = setup(true);
  canvas.pointerDown(pointer(100));
  canvas.pointerMove(pointer(200, 72));
  expect(canvas.getCursor()).toBe("not-allowed");
  canvas.pointerUp(pointer(200, 72));
  expect(onConnect).not.toHaveBeenCalled();
  expect(canvas.getSnapshot().connectionPreview).toBeNull();
});
it.each(["escape", "cancel", "pinch"])("cancels port dragging on %s", (action) => {
  const { canvas, onConnect } = setup(true);
  canvas.pointerDown(pointer(100, 40, true));
  canvas.pointerMove(pointer(150, 40, true));
  expect(canvas.getSnapshot().connectionPreview).not.toBeNull();
  if (action === "escape") canvas.command("escape");
  else if (action === "cancel") canvas.cancel();
  else canvas.pointerDown(pointer(250, 40, true, 2));
  expect(canvas.getSnapshot().connectionPreview).toBeNull();
  expect(canvas.getPortSnapshot().anchor).toBeNull();
  canvas.pointerUp(pointer(200, 40, true));
  canvas.pointerUp(pointer(250, 40, true, 2));
  expect(onConnect).not.toHaveBeenCalled();
});
it("second finger cancels a pending press and suppresses remaining finger taps", () => {
  const { canvas } = setup();
  tap(canvas);
  canvas.pointerDown(pointer(200, 40, true));
  canvas.pointerDown(pointer(250, 40, true, 2));
  expect(canvas.getSnapshot().interaction).toBe("pinch");
  expect(canvas.getPortSnapshot().pending).toEqual([]);
  canvas.pointerUp(pointer(250, 40, true, 2));
  canvas.pointerUp(pointer(200, 40, true));
  expect(canvas.getPortSnapshot().preview).toBeNull();
  expect(canvas.getPortSnapshot().anchor).toMatchObject(ports[0]);
});
it("targets the nearest port without preferring a farther compatible port", () => {
  const { canvas, onConnect } = setup(true);
  canvas.pointerDown(pointer(100));
  canvas.pointerMove(pointer(200, 58, true));
  expect(canvas.getPortSnapshot().hover).toEqual([ports[2]]);
  expect(canvas.getCursor(pointer(200, 58, true))).toBe("not-allowed");
  canvas.pointerUp(pointer(200, 58, true));
  expect(onConnect).not.toHaveBeenCalled();
  canvas.pointerDown(pointer(100, 40, true));
  canvas.pointerMove(pointer(200, 54, true));
  expect(canvas.getPortSnapshot().hover).toEqual([ports[1]]);
  expect(canvas.getSnapshot().connectionPreview?.at(-1)).toEqual({ x: 200, y: 40 });
  canvas.pointerUp(pointer(200, 54, true));
  expect(onConnect).toHaveBeenCalledTimes(1);
});
it.each([54, 56, 58])("touch selects the nearest source at y=%s, with stable ties", (y) => {
  const { canvas } = setup();
  const expected = y <= 56 ? ports[1] : ports[2];
  canvas.pointerDown(pointer(200, y, true));
  expect(canvas.getPortSnapshot().pending).toEqual([expected]);
  canvas.pointerUp(pointer(200, y, true));
  expect(canvas.getPortSnapshot().anchor).toEqual(expected);
});
it.each([0.25, 0.5, 1, 2])("uses screen distance with overlapping targets at zoom %s", (zoom) => {
  const camera = { x: 40, y: 20, zoom };
  const selection = new Set(["b"]);
  const offset = { x: 16, y: 8 };
  const point = { x: 40 + 216 * zoom, y: 20 + (72 + 8) * zoom - 1 };
  expect(hitTestPorts(point, true, camera, items, ports, selection, offset)).toEqual([ports[2]]);
});
it("Escape clears ports first and nodes second; cancel preserves anchor", () => {
  const { canvas } = setup();
  tap(canvas);
  canvas.pointerDown(pointer(200));
  canvas.cancel();
  expect(canvas.getPortSnapshot().anchor).not.toBeNull();
  expect(canvas.getPortSnapshot().pending).toEqual([]);
  canvas.command("escape");
  expect(canvas.getPortSnapshot().anchor).toBeNull();
  expect([...canvas.getSnapshot().selection]).toEqual(["a"]);
  canvas.command("escape");
  expect(canvas.getSnapshot().selection.size).toBe(0);
});
it("modifiers take priority over port selection", () => {
  const { canvas } = setup();
  tap(canvas, { ...pointer(100), marquee: true } as ReturnType<typeof pointer>);
  expect(canvas.getPortSnapshot().anchor).toBeNull();
});
it("refreshes stationary hover after camera changes", () => {
  const { canvas } = setup();
  canvas.hoverPort(pointer(100));
  expect(canvas.getPortSnapshot().hover).toHaveLength(1);
  canvas.zoomTo(2, { x: 0, y: 0 });
  expect(canvas.getPortSnapshot().hover).toHaveLength(0);
});
it("clears a removed stable anchor and its preview", () => {
  const { canvas } = setup();
  canvas.selectPort(ports[0]);
  canvas.selectPort(ports[1]);
  canvas.setPorts(ports.slice(1));
  expect(canvas.getPortSnapshot().anchor).toBeNull();
  expect(canvas.getPortSnapshot().preview).toBeNull();
  expect(canvas.getPortSnapshot().compatible.size).toBe(0);
});
it.each([0.1, 0.5, 1, 2, 8])(
  "uses CSS hit targets, temporary offsets and occlusion at zoom %s",
  (zoom) => {
    const camera = { x: 0, y: 0, zoom };
    const selection = new Set(["a"]);
    const offset = { x: 20, y: 0 };
    const point = { x: 120 * zoom, y: 40 * zoom };
    const hit = hitTestPorts(point, true, camera, items, ports, selection, offset);
    expect(hit.map(portId)).toContain(portId(ports[0]));
    const covered = [...items, { id: "cover", x: 110, y: 0, width: 100, height: 100 }];
    expect(
      hitTestPorts(point, true, camera, covered, ports, selection, offset).map(portId),
    ).not.toContain(portId(ports[0]));
  },
);
it("expanded targets cannot reach through a covering card body", () => {
  expect(
    hitTestPorts(
      { x: 115, y: 40 },
      true,
      { x: 0, y: 0, zoom: 1 },
      [...items, { id: "cover", x: 110, y: 0, width: 50, height: 100 }],
      ports,
      new Set(),
      { x: 0, y: 0 },
    ),
  ).toEqual([]);
});

it.each([194, 200, 206])("port hit area owns x=%s across the node border", (x) => {
  const { canvas, move } = setup();
  canvas.hoverPort(pointer(x));
  expect(canvas.getPortSnapshot().hover).toEqual([ports[1]]);
  canvas.pointerDown(pointer(x));
  expect(canvas.getPortSnapshot().pending).toEqual([ports[1]]);
  expect(canvas.getSnapshot().interaction).not.toBe("drag");
  canvas.pointerUp(pointer(x));
  expect(canvas.getPortSnapshot().anchor).toEqual(ports[1]);
  expect(move).not.toHaveBeenCalled();
});

it("highlights an inspector port without changing selection or starting a connection", () => {
  const { canvas } = setup();
  const before = canvas.getSnapshot().selection;
  canvas.highlightPort(ports[0]);
  expect(canvas.getPortSnapshot().hover).toEqual([ports[0]]);
  expect(canvas.getPortSnapshot().anchor).toBeNull();
  expect(canvas.getSnapshot().selection).toBe(before);
  canvas.setPorts(ports.slice(1));
  expect(canvas.getPortSnapshot().hover).toEqual([]);
  canvas.highlightPort(ports[1]);
  canvas.highlightPort(null);
  expect(canvas.getPortSnapshot().hover).toEqual([]);
});
