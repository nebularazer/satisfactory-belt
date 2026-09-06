import type { MaterialLink } from "@satisfactory-belt/planning";

import type { CanvasDocument } from "./document";
import type { Point, Rectangle } from "./geometry";
import { materialPortGeometry } from "./material-port-geometry";

export type MaterialLinkPath = Readonly<{
  bounds: Rectangle;
  control1: Point;
  control2: Point;
  from: Point;
  link: MaterialLink;
  to: Point;
}>;

export type MaterialConnectionPreviewCurve = Readonly<{
  control1: Point;
  control2: Point;
}>;

const CONNECTION_PREVIEW_MIN_LENGTH_PX = 10;

export function materialConnectionPreviewCurve(
  from: Point,
  to: Point,
  zoom: number,
): MaterialConnectionPreviewCurve | undefined {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance * zoom < CONNECTION_PREVIEW_MIN_LENGTH_PX) {
    return undefined;
  }
  const bend = Math.min(
    Math.max(48, Math.abs(to.x - from.x) * 0.5),
    distance * 0.5,
  );
  return {
    control1: { x: from.x + bend, y: from.y },
    control2: { x: to.x - bend, y: to.y },
  };
}

function pathFromPoints(
  link: MaterialLink,
  from: Point,
  to: Point,
): MaterialLinkPath {
  const bend = Math.max(48, Math.abs(to.x - from.x) * 0.5);
  const control1 = { x: from.x + bend, y: from.y };
  const control2 = { x: to.x - bend, y: to.y };
  return {
    bounds: {
      height:
        Math.max(from.y, to.y, control1.y, control2.y) -
        Math.min(from.y, to.y, control1.y, control2.y),
      width:
        Math.max(from.x, to.x, control1.x, control2.x) -
        Math.min(from.x, to.x, control1.x, control2.x),
      x: Math.min(from.x, to.x, control1.x, control2.x),
      y: Math.min(from.y, to.y, control1.y, control2.y),
    },
    control1,
    control2,
    from,
    link,
    to,
  };
}

function normalized(rectangle: Rectangle): Rectangle {
  return {
    height: Math.abs(rectangle.height),
    width: Math.abs(rectangle.width),
    x: rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x,
    y: rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y,
  };
}

function intersects(left: Rectangle, right: Rectangle) {
  const a = normalized(left);
  const b = normalized(right);
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function materialLinkPath(
  document: CanvasDocument,
  link: MaterialLink,
): MaterialLinkPath | undefined {
  const fromNode = document.nodes.find(
    ({ configuration }) => configuration.id === link.from.nodeId,
  );
  const toNode = document.nodes.find(
    ({ configuration }) => configuration.id === link.to.nodeId,
  );
  const from = fromNode
    ? materialPortGeometry(fromNode).find(
        ({ port }) => port.id === link.from.portId,
      )?.point
    : undefined;
  const to = toNode
    ? materialPortGeometry(toNode).find(
        ({ port }) => port.id === link.to.portId,
      )?.point
    : undefined;
  if (!from || !to) return undefined;
  return pathFromPoints(link, from, to);
}

export function materialLinkPoint(path: MaterialLinkPath, t: number): Point {
  const inverse = 1 - t;
  return {
    x:
      inverse ** 3 * path.from.x +
      3 * inverse ** 2 * t * path.control1.x +
      3 * inverse * t ** 2 * path.control2.x +
      t ** 3 * path.to.x,
    y:
      inverse ** 3 * path.from.y +
      3 * inverse ** 2 * t * path.control1.y +
      3 * inverse * t ** 2 * path.control2.y +
      t ** 3 * path.to.y,
  };
}

function pointSegmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

export function distanceToMaterialLink(path: MaterialLinkPath, point: Point) {
  let distance = Number.POSITIVE_INFINITY;
  let previous = path.from;
  for (let index = 1; index <= 20; index += 1) {
    const current = materialLinkPoint(path, index / 20);
    distance = Math.min(
      distance,
      pointSegmentDistance(point, previous, current),
    );
    previous = current;
  }
  return distance;
}

export function createMaterialLinkIndex(document: CanvasDocument) {
  let current = document;
  let paths: MaterialLinkPath[] = [];
  const rebuild = () => {
    const points = new Map(
      current.nodes.flatMap((node) =>
        materialPortGeometry(node).map(
          ({ nodeId, point, port }) =>
            [`${nodeId}\u0000${port.id}`, point] as const,
        ),
      ),
    );
    paths = current.materialLinks.flatMap((link) => {
      const from = points.get(`${link.from.nodeId}\u0000${link.from.portId}`);
      const to = points.get(`${link.to.nodeId}\u0000${link.to.portId}`);
      return from && to ? [pathFromPoints(link, from, to)] : [];
    });
  };
  rebuild();
  return {
    hitTest(point: Point, radius: number) {
      return paths
        .filter(({ bounds }) =>
          intersects(bounds, {
            height: radius * 2,
            width: radius * 2,
            x: point.x - radius,
            y: point.y - radius,
          }),
        )
        .map((path) => ({
          distance: distanceToMaterialLink(path, point),
          path,
        }))
        .filter(({ distance }) => distance <= radius)
        .toSorted((left, right) => left.distance - right.distance)[0]?.path
        .link;
    },
    query(rectangle: Rectangle) {
      return paths.filter(({ bounds }) => intersects(bounds, rectangle));
    },
    replace(next: CanvasDocument) {
      current = next;
      rebuild();
    },
  };
}
