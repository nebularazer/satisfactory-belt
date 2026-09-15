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
function setup() {
  const move = vi.fn();
  const canvas = new CanvasController({ items, onMove: move });
  canvas.setPorts(
    ports,
    (a, b) =>
      a.portKey.endsWith("water") && b.portKey.endsWith("water")
        ? { compatible: true, output: ports[0], input: ports[1] }
        : { compatible: false, reason: "different-material" },
    () => [ports[1]],
  );
  return { canvas, move };
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
it("swipes pan from the original press and preserve a committed anchor", () => {
  const { canvas, move } = setup();
  tap(canvas);
  canvas.pointerDown(pointer(200, 40, true));
  canvas.pointerUp(pointer(230, 40, true));
  expect(canvas.getSnapshot().camera.x).toBe(30);
  expect(canvas.getPortSnapshot().anchor).toMatchObject(ports[0]);
  expect(canvas.getPortSnapshot().preview).toBeNull();
  expect(move).not.toHaveBeenCalled();
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
it("ambiguous touch opens a chooser without choosing by compatibility", () => {
  const { canvas } = setup();
  tap(canvas);
  tap(canvas, pointer(200, 56, true));
  expect(canvas.getPortSnapshot().chooser?.candidates).toHaveLength(2);
  expect(canvas.getPortSnapshot().preview).toBeNull();
  canvas.selectPort(ports[2]);
  expect(canvas.getPortSnapshot().preview).toBeNull();
  expect(canvas.getPortSnapshot().anchor).toMatchObject(ports[0]);
  canvas.selectPort(ports[1]);
  expect(canvas.getPortSnapshot().preview).toEqual(ports[1]);
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
