import {
  Application,
  Container,
  Graphics,
} from "pixi.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  panViewport,
  zoomViewportAt,
  type Point,
  type Viewport,
} from "./viewport";

const GRID_SIZE = 32;
const ZOOM_STEP = 1.2;

export type InfiniteCanvasHandle = {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InfiniteCanvasProps = {
  onViewportChange: (viewport: Viewport) => void;
};

type DragState = {
  pointerId: number;
  last: Point;
};

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function drawGrid(graphics: Graphics, viewport: Viewport, width: number, height: number) {
  graphics.clear();

  let spacing = GRID_SIZE * viewport.zoom;
  while (spacing < 20) spacing *= 2;
  while (spacing > 80) spacing /= 2;

  const offsetX = positiveModulo(viewport.x, spacing);
  const offsetY = positiveModulo(viewport.y, spacing);

  for (let x = offsetX; x <= width; x += spacing) {
    graphics.moveTo(x, 0).lineTo(x, height);
  }

  for (let y = offsetY; y <= height; y += spacing) {
    graphics.moveTo(0, y).lineTo(width, y);
  }

  graphics.stroke({ color: 0xb7bfca, alpha: 0.28, pixelLine: true, width: 1 });
}

export const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(
  function InfiniteCanvas({ onViewportChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const gridRef = useRef<Graphics | null>(null);
    const worldRef = useRef<Container | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });

    const renderViewport = (viewport: Viewport) => {
      viewportRef.current = viewport;

      const app = appRef.current;
      const grid = gridRef.current;
      const world = worldRef.current;

      if (app && grid && world) {
        world.position.set(viewport.x, viewport.y);
        world.scale.set(viewport.zoom);
        drawGrid(grid, viewport, app.screen.width, app.screen.height);
      }

      onViewportChange(viewport);
    };

    const viewportCenter = (): Point => {
      const app = appRef.current;
      return app
        ? { x: app.screen.width / 2, y: app.screen.height / 2 }
        : { x: 0, y: 0 };
    };

    const zoomBy = (factor: number) => {
      const current = viewportRef.current;
      renderViewport(zoomViewportAt(current, current.zoom * factor, viewportCenter()));
    };

    const resetView = () => {
      const center = viewportCenter();
      renderViewport({ x: center.x, y: center.y, zoom: 1 });
    };

    useImperativeHandle(ref, () => ({
      resetView,
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
    }));

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const app = new Application();
      let active = true;
      let resizeObserver: ResizeObserver | undefined;
      let removeListeners: (() => void) | undefined;

      void app
        .init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          height: Math.max(host.clientHeight, 1),
          preference: "webgl",
          resolution: Math.min(window.devicePixelRatio, 2),
          width: Math.max(host.clientWidth, 1),
        })
        .then(() => {
          if (!active) {
            app.destroy(true);
            return;
          }

          appRef.current = app;
          app.canvas.className = "infinite-canvas__surface";
          app.canvas.setAttribute("aria-label", "Infinite canvas");
          app.canvas.setAttribute("role", "application");
          app.canvas.tabIndex = 0;
          host.appendChild(app.canvas);

          const grid = new Graphics();
          const world = new Container();
          const origin = new Graphics()
            .circle(0, 0, 4)
            .fill({ color: 0x6965db, alpha: 0.9 });

          world.addChild(origin);
          app.stage.addChild(grid, world);
          gridRef.current = grid;
          worldRef.current = world;

          const initialViewport = {
            x: app.screen.width / 2,
            y: app.screen.height / 2,
            zoom: 1,
          };
          renderViewport(initialViewport);
          let canvasSize = {
            height: app.screen.height,
            width: app.screen.width,
          };

          const canvas = app.canvas;

          const pointerDown = (event: PointerEvent) => {
            if (event.button !== 0 && event.button !== 1) return;
            canvas.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              last: { x: event.clientX, y: event.clientY },
            };
            canvas.dataset.dragging = "true";
          };

          const pointerMove = (event: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;

            const next = { x: event.clientX, y: event.clientY };
            const delta = { x: next.x - drag.last.x, y: next.y - drag.last.y };
            drag.last = next;
            renderViewport(panViewport(viewportRef.current, delta));
          };

          const pointerUp = (event: PointerEvent) => {
            if (dragRef.current?.pointerId !== event.pointerId) return;
            dragRef.current = null;
            canvas.dataset.dragging = "false";
            if (canvas.hasPointerCapture(event.pointerId)) {
              canvas.releasePointerCapture(event.pointerId);
            }
          };

          const wheel = (event: WheelEvent) => {
            event.preventDefault();

            if (event.ctrlKey || event.metaKey) {
              const bounds = canvas.getBoundingClientRect();
              const anchor = {
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
              };
              const factor = Math.exp(-event.deltaY * 0.005);
              renderViewport(
                zoomViewportAt(
                  viewportRef.current,
                  viewportRef.current.zoom * factor,
                  anchor,
                ),
              );
              return;
            }

            renderViewport(
              panViewport(viewportRef.current, {
                x: event.shiftKey ? -event.deltaY : -event.deltaX,
                y: event.shiftKey ? 0 : -event.deltaY,
              }),
            );
          };

          const keyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches("input, textarea, [contenteditable='true']")) return;

            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              zoomBy(ZOOM_STEP);
            } else if (event.key === "-") {
              event.preventDefault();
              zoomBy(1 / ZOOM_STEP);
            } else if (event.key === "0") {
              event.preventDefault();
              resetView();
            }
          };

          canvas.addEventListener("pointerdown", pointerDown);
          canvas.addEventListener("pointermove", pointerMove);
          canvas.addEventListener("pointerup", pointerUp);
          canvas.addEventListener("pointercancel", pointerUp);
          canvas.addEventListener("wheel", wheel, { passive: false });
          window.addEventListener("keydown", keyDown);

          resizeObserver = new ResizeObserver(([entry]) => {
            if (!entry) return;

            const nextSize = {
              height: Math.max(entry.contentRect.height, 1),
              width: Math.max(entry.contentRect.width, 1),
            };

            app.renderer.resize(nextSize.width, nextSize.height);
            renderViewport(
              panViewport(viewportRef.current, {
                x: (nextSize.width - canvasSize.width) / 2,
                y: (nextSize.height - canvasSize.height) / 2,
              }),
            );
            canvasSize = nextSize;
          });
          resizeObserver.observe(host);

          removeListeners = () => {
            canvas.removeEventListener("pointerdown", pointerDown);
            canvas.removeEventListener("pointermove", pointerMove);
            canvas.removeEventListener("pointerup", pointerUp);
            canvas.removeEventListener("pointercancel", pointerUp);
            canvas.removeEventListener("wheel", wheel);
            window.removeEventListener("keydown", keyDown);
          };
        });

      return () => {
        active = false;
        removeListeners?.();
        resizeObserver?.disconnect();
        dragRef.current = null;
        gridRef.current = null;
        worldRef.current = null;

        if (appRef.current === app) {
          appRef.current = null;
          app.destroy(true, { children: true });
        }
      };
    }, []);

    return (
      <div
        className="infinite-canvas"
        onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => event.preventDefault()}
        ref={hostRef}
      />
    );
  },
);
