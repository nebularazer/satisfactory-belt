import type { CanvasItem } from "./controller";
import { contains, worldToScreen } from "./geometry";
import type { Camera, Point } from "./geometry";

export type PortReference = Readonly<{ nodeId: string; portKey: string }>;
export type CanvasPort = PortReference &
  Point &
  Readonly<{
    direction: "input" | "output";
    radius: number;
  }>;
export type PortCompatibility =
  | Readonly<{ compatible: true; output: PortReference; input: PortReference }>
  | Readonly<{ compatible: false; reason: string }>;
export const samePort = (a: PortReference | null, b: PortReference | null): boolean =>
  a !== null && b !== null && a.nodeId === b.nodeId && a.portKey === b.portKey;
export const portId = (port: PortReference): string => JSON.stringify([port.nodeId, port.portKey]);
export type PortSelection = Readonly<{
  anchor: PortReference | null;
  preview: PortReference | null;
  hover: readonly PortReference[];
  pending: readonly PortReference[];
  chooser: Readonly<{ point: Point; candidates: readonly PortReference[] }> | null;
  compatible: ReadonlySet<string>;
}>;
export const emptyPortSelection = (): PortSelection => ({
  anchor: null,
  preview: null,
  hover: [],
  pending: [],
  chooser: null,
  compatible: new Set(),
});

/** Project CSS-pixel hit areas in document draw order, respecting covering cards. */
export function hitTestPorts(
  point: Point,
  touch: boolean,
  camera: Camera,
  items: readonly CanvasItem[],
  ports: readonly CanvasPort[],
  selection: ReadonlySet<string>,
  offset: Point,
): readonly CanvasPort[] {
  const cards = items.map((item) => {
    const moved = selection.has(item.id);
    return {
      ...item,
      ...worldToScreen(
        { x: item.x + (moved ? offset.x : 0), y: item.y + (moved ? offset.y : 0) },
        camera,
      ),
      width: item.width * camera.zoom,
      height: item.height * camera.zoom,
    };
  });
  const order = new Map(cards.map((card, index) => [card.id, index]));
  return ports.filter((port) => {
    const index = order.get(port.nodeId);
    if (index === undefined) return false;
    const card = cards[index]!;
    const anchor = { x: card.x + port.x * camera.zoom, y: card.y + port.y * camera.zoom };
    const radius = Math.max(touch ? 22 : 12, port.radius * camera.zoom);
    if (Math.abs(point.x - anchor.x) > radius || Math.abs(point.y - anchor.y) > radius)
      return false;
    return !cards
      .slice(index + 1)
      .some((cover) => contains(cover, anchor) || contains(cover, point));
  });
}
