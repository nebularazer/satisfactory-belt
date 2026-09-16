import { expect, it, vi } from "vitest";

import { CanvasController } from "./controller";
import { screenToWorld } from "./geometry";

const source = { nodeId: "a", portKey: "output" };
const pointer = (x: number, y = 50, touch = false, id = 1) => ({ x, y, touch, id });
function setup() {
  const controller = new CanvasController({
    items: [{ id: "a", x: 0, y: 0, width: 100, height: 100 }],
    onMove: vi.fn(),
  });
  controller.setPorts([{ ...source, direction: "output", x: 100, y: 50, radius: 7 }]);
  const request = vi.fn();
  controller.subscribeCatalog(request);
  return { controller, request };
}
it("opens at the world-space click or viewport center, excluding existing content", () => {
  const { controller, request } = setup();
  controller.openCatalogAt(pointer(40));
  controller.openCatalogAt(pointer(105));
  expect(request).not.toHaveBeenCalled();
  controller.resize({ width: 1000, height: 800 });
  controller.zoomTo(2);
  const camera = controller.getSnapshot().camera;
  controller.openCatalogAt(pointer(800, 700));
  expect(request).toHaveBeenLastCalledWith({
    position: screenToWorld({ x: 800, y: 700 }, camera),
    source: undefined,
  });
  controller.selectPort(source);
  controller.openCatalogAtCenter();
  expect(request).toHaveBeenLastCalledWith({
    position: screenToWorld({ x: 500, y: 400 }, camera),
    source: undefined,
  });
});
it.each([false, true])(
  "port drag and sequential selection open the same search (touch=%s)",
  (touch) => {
    const { controller, request } = setup();
    controller.pointerDown(pointer(100, 50, touch));
    controller.pointerUp(pointer(400, 200, touch));
    expect(request).toHaveBeenCalledExactlyOnceWith({ position: { x: 400, y: 200 }, source });
    expect(controller.getPortSnapshot().anchor).toMatchObject(source);
    expect(controller.getSnapshot().interaction).toBe("idle");
    expect(controller.getSnapshot().connectionPreview).toBeNull();
    controller.pointerDown(pointer(500, 300, touch));
    controller.pointerUp(pointer(500, 300, touch));
    expect(request).toHaveBeenLastCalledWith({ position: { x: 500, y: 300 }, source });
    controller.command("escape");
    expect(controller.getPortSnapshot().anchor).toBeNull();
  },
);
it("panning, pinching, cancellation and drops on nodes or links never open search", () => {
  const { controller, request } = setup();
  controller.selectPort(source);
  controller.pointerDown(pointer(400));
  controller.pointerUp(pointer(450));
  expect(request).not.toHaveBeenCalled();
  controller.command("reset");
  controller.pointerDown(pointer(100));
  controller.pointerUp(pointer(40));
  controller.setLinks([
    {
      id: "link",
      output: source,
      input: { nodeId: "b", portKey: "input" },
      points: [
        { x: 200, y: 200 },
        { x: 500, y: 200 },
      ],
    },
  ]);
  controller.openCatalogAt(pointer(300, 200));
  controller.pointerDown(pointer(100));
  controller.pointerUp(pointer(300, 200));
  controller.pointerDown(pointer(100, 50, true));
  controller.pointerDown(pointer(300, 50, true, 2));
  controller.pointerUp(pointer(400, 200, true));
  controller.pointerUp(pointer(300, 50, true, 2));
  controller.pointerDown(pointer(100));
  controller.cancel();
  controller.pointerUp(pointer(400));
  expect(request).not.toHaveBeenCalled();
});
