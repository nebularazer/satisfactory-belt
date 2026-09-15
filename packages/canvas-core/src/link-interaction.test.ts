import { expect, it, vi } from "vitest";

import { CanvasController } from "./controller";
import { linkHandles, routeLink } from "./links";
const output = { nodeId: "a", portKey: "output" },
  input = { nodeId: "b", portKey: "input" };
function setup() {
  const onRoute = vi.fn(),
    onMove = vi.fn();
  const controller = new CanvasController({ items: [], onMove, onRoute });
  const link = {
    id: "link",
    output,
    input,
    points: routeLink({ x: 100, y: 100 }, { x: 500, y: 100 }),
  };
  controller.setLinks([link]);
  return { controller, onRoute, onMove, link };
}
it("selects links only on release; a swipe starting on a line pans", () => {
  const { controller } = setup();
  controller.pointerDown({ id: 1, x: 300, y: 100 });
  expect(controller.getLinkSnapshot().selected).toBeNull();
  controller.pointerUp({ id: 1, x: 300, y: 100 });
  expect(controller.getLinkSnapshot().selected).toBe("link");
  controller.command("escape");
  controller.pointerDown({ id: 1, x: 200, y: 100, touch: true });
  controller.pointerUp({ id: 1, x: 240, y: 140, touch: true });
  expect(controller.getSnapshot().camera).toMatchObject({ x: 40, y: 40 });
  expect(controller.getLinkSnapshot().selected).toBeNull();
});
it("previews snapped segment movement and commits once on release", () => {
  const { controller, onRoute, onMove, link } = setup();
  controller.selectLink(link.id);
  const handle = linkHandles(link)[0];
  controller.pointerDown({ id: 1, x: handle.x, y: handle.y });
  controller.pointerMove({ id: 1, x: handle.x, y: handle.y + 45 });
  expect(onRoute).not.toHaveBeenCalled();
  expect(controller.getLinkSnapshot().preview?.guides).toEqual([{ axis: "y", position: 144 }]);
  expect(controller.getSnapshot().links[0].points.some((p) => p.y === 144)).toBe(true);
  controller.pointerUp({ id: 1, x: handle.x, y: handle.y + 45 });
  expect(onRoute).toHaveBeenCalledExactlyOnceWith("link", [{ axis: "y", position: 144 }]);
  expect(onMove).not.toHaveBeenCalled();
  expect(controller.getLinkSnapshot().preview).toBeNull();
});
it.each(["escape", "cancel", "pinch"])(
  "cancels segment previews on %s without a document edit",
  (action) => {
    const { controller, onRoute, link } = setup();
    controller.selectLink(link.id);
    const handle = linkHandles(link)[0];
    controller.pointerDown({ id: 1, x: handle.x, y: handle.y, touch: true });
    controller.pointerMove({ id: 1, x: handle.x, y: handle.y + 40, touch: true });
    if (action === "escape") controller.command("escape");
    else if (action === "cancel") controller.cancel();
    else controller.pointerDown({ id: 2, x: handle.x + 100, y: handle.y, touch: true });
    expect(controller.getLinkSnapshot().preview).toBeNull();
    controller.pointerUp({ id: 1, x: handle.x, y: handle.y + 40, touch: true });
    controller.pointerUp({ id: 2, x: handle.x + 100, y: handle.y, touch: true });
    expect(onRoute).not.toHaveBeenCalled();
  },
);
it("selects the topmost line on exact ties and respects cards covering links", () => {
  const { controller, link } = setup();
  controller.setLinks([link, { ...link, id: "second" }]);
  controller.pointerDown({ id: 1, x: 300, y: 100 });
  controller.pointerUp({ id: 1, x: 300, y: 100 });
  expect(controller.getLinkSnapshot().selected).toBe("second");
  controller.setItems([{ id: "cover", x: 280, y: 80, width: 40, height: 40 }]);
  controller.pointerDown({ id: 1, x: 300, y: 100 });
  expect(controller.getSnapshot().interaction).toBe("drag");
  expect(controller.getLinkSnapshot().selected).toBeNull();
});
it("retains the anchor without an error outline when a commit is rejected", () => {
  const onConnect = vi.fn(() => ({ compatible: false as const, reason: "duplicate-link" }));
  const controller = new CanvasController({ items: [], onMove: vi.fn(), onConnect });
  controller.setPorts(
    [
      { ...output, x: 0, y: 0, radius: 7, direction: "output" },
      { ...input, x: 0, y: 0, radius: 7, direction: "input" },
    ],
    () => ({ compatible: true, output, input }),
    () => [input],
  );
  controller.selectPort(output);
  controller.selectPort(input);
  expect(onConnect).toHaveBeenCalledOnce();
  expect(controller.getPortSnapshot().anchor).toEqual(output);
  expect(controller.getPortSnapshot().preview).toBeNull();
});

it("uses a forbidden cursor over incompatible targets and never commits their activation", () => {
  const onConnect = vi.fn();
  const controller = new CanvasController({
    items: [
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 300, y: 0, width: 100, height: 100 },
    ],
    onMove: vi.fn(),
    onConnect,
  });
  controller.setPorts(
    [
      { ...output, x: 100, y: 50, radius: 7, direction: "output" },
      { ...input, x: 0, y: 50, radius: 7, direction: "input" },
    ],
    () => ({ compatible: false, reason: "different-material" }),
    () => [],
  );
  controller.selectPort(output);
  expect(controller.getCursor({ id: 1, x: 300, y: 50 })).toBe("not-allowed");
  controller.pointerDown({ id: 1, x: 300, y: 50 });
  controller.pointerUp({ id: 1, x: 300, y: 50 });
  expect(onConnect).not.toHaveBeenCalled();
  expect(controller.getPortSnapshot().anchor).toEqual(output);
  expect(controller.getPortSnapshot().preview).toBeNull();
});
