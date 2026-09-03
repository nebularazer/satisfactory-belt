export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.2;

export type Point = Readonly<{
  x: number;
  y: number;
}>;

export type Viewport = Readonly<{
  x: number;
  y: number;
  zoom: number;
}>;

type ScreenSize = Readonly<{
  height: number;
  width: number;
}>;

type Rectangle = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function panViewport(viewport: Viewport, delta: Point): Viewport {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function zoomViewportAt(
  viewport: Viewport,
  requestedZoom: number,
  anchor: Point,
): Viewport {
  const zoom = clampZoom(requestedZoom);
  const worldAnchor = screenToWorld(anchor, viewport);

  return {
    x: anchor.x - worldAnchor.x * zoom,
    y: anchor.y - worldAnchor.y * zoom,
    zoom,
  };
}

export function fitRectangleInViewport(
  rectangle: Rectangle,
  screen: ScreenSize,
  maximumZoom = 1,
): Viewport {
  const padding = Math.min(64, screen.width / 4, screen.height / 4);
  const availableWidth = Math.max(screen.width - padding * 2, 1);
  const availableHeight = Math.max(screen.height - padding * 2, 1);
  const zoom = clampZoom(
    Math.min(
      maximumZoom,
      availableWidth / Math.max(rectangle.width, 1),
      availableHeight / Math.max(rectangle.height, 1),
    ),
  );
  const centerX = rectangle.x + rectangle.width / 2;
  const centerY = rectangle.y + rectangle.height / 2;

  return {
    x: screen.width / 2 - centerX * zoom,
    y: screen.height / 2 - centerY * zoom,
    zoom,
  };
}
