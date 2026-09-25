export type Point = Readonly<{ x: number; y: number }>;
export type Size = Readonly<{ width: number; height: number }>;
export type Bounds = Point & Size;
export type Camera = Point & Readonly<{ zoom: number }>;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export function screenToWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function worldToScreen(point: Point, camera: Camera): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

export function zoomAt(camera: Camera, anchor: Point, zoom: number): Camera {
  const world = screenToWorld(anchor, camera);
  const nextZoom = clampZoom(zoom);
  return { x: anchor.x - world.x * nextZoom, y: anchor.y - world.y * nextZoom, zoom: nextZoom };
}

export function boundsBetween(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

export function contains(bounds: Bounds, point: Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function fitCamera(items: readonly Bounds[], viewport: Size, padding = 64): Camera {
  if (items.length === 0) return { x: 0, y: 0, zoom: 1 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const item of items) {
    left = Math.min(left, item.x);
    top = Math.min(top, item.y);
    right = Math.max(right, item.x + item.width);
    bottom = Math.max(bottom, item.y + item.height);
  }
  const zoom = clampZoom(
    Math.min(
      1,
      Math.max(1, viewport.width - padding * 2) / Math.max(1, right - left),
      Math.max(1, viewport.height - padding * 2) / Math.max(1, bottom - top),
    ),
  );
  return {
    x: viewport.width / 2 - ((left + right) / 2) * zoom,
    y: viewport.height / 2 - ((top + bottom) / 2) * zoom,
    zoom,
  };
}
