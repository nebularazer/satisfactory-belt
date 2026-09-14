import {
  CanvasController,
  commandForKey,
  intersects,
  worldToScreen,
} from "@satisfactory-belt/canvas-core";
import type { CanvasItem, CanvasPointer, CanvasSnapshot } from "@satisfactory-belt/canvas-core";
import { Application, Container, Graphics, Text } from "pixi.js";

type ItemView = {
  container: Container;
  rectangle: Graphics;
  label: Text;
  clip: Graphics;
  item: CanvasItem;
  zoom: number;
  selected: boolean;
};

const MARQUEE_FILL = { color: "#6960d9", alpha: 0.09 };

export type CanvasView = { destroy: () => void; focus: () => void };

/** Owns browser resources; abort also cleans up an initialization still in flight. */
export async function mountCanvas(
  host: HTMLElement,
  controller: CanvasController,
  options: { signal?: AbortSignal; fontFamily?: string } = {},
): Promise<CanvasView> {
  const app = new Application();
  const fontFamily = options.fontFamily ?? "sans-serif";
  await document.fonts.load(`500 14px "${fontFamily}"`);
  if (options.signal?.aborted) return { destroy() {}, focus() {} };
  await app.init({
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
    background: "#fafafa",
    antialias: true,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  if (options.signal?.aborted) {
    app.destroy(true, { children: true, texture: true, textureSource: true });
    return { destroy() {}, focus() {} };
  }

  const canvas = app.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Canvas. Drag empty space to pan. Control or Command and drag to select. Scroll to zoom. 0 resets the view, Shift 1 fits all, plus and minus zoom.",
  );
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none;";
  app.stage.eventMode = "none";
  host.append(canvas);

  const grid = new Graphics();
  const itemsLayer = new Container();
  const overlay = new Graphics();
  app.stage.addChild(grid, itemsLayer, overlay);
  const views = new Map<string, ItemView>();
  let lastGridKey = "";
  let previousItems: readonly CanvasItem[] | null = null;
  let frame = 0;
  let destroyed = false;
  let resolution = window.devicePixelRatio || 1;
  const events = new AbortController();
  const captured = new Set<number>();

  function invalidate() {
    if (!destroyed && !frame) frame = requestAnimationFrame(render);
  }

  function textResolution(zoom: number) {
    // Cache enough pixels for the current zoom range instead of rasterizing every wheel step.
    return resolution * Math.max(1, 2 ** Math.ceil(Math.log2(zoom)));
  }

  function createItem(item: CanvasItem): ItemView {
    const container = new Container();
    const rectangle = new Graphics();
    const label = new Text({
      text: item.text,
      resolution,
      roundPixels: true,
      anchor: 0.5,
      style: { fontFamily, fontSize: 14, fontWeight: "500", fill: "#424554" },
    });
    const clip = new Graphics();
    clip.visible = false;
    container.addChild(rectangle, label, clip);
    itemsLayer.addChild(container);
    return { container, rectangle, label, clip, item, zoom: -1, selected: false };
  }

  function drawGrid(snapshot: CanvasSnapshot) {
    const { camera, viewport } = snapshot;
    const key = `${camera.x},${camera.y},${camera.zoom},${viewport.width},${viewport.height}`;
    if (key === lastGridKey) return;
    lastGridKey = key;
    let spacing = 32 * camera.zoom;
    while (spacing < 20) spacing *= 2;
    while (spacing > 64) spacing /= 2;
    grid.clear();
    const startX = ((camera.x % spacing) + spacing) % spacing;
    const startY = ((camera.y % spacing) + spacing) % spacing;
    for (let x = startX; x < viewport.width; x += spacing) {
      for (let y = startY; y < viewport.height; y += spacing) grid.circle(x, y, 0.8);
    }
    grid.fill("#dcdce2");
  }

  function render() {
    frame = 0;
    if (destroyed) return;
    const snapshot = controller.getSnapshot();
    const { camera, viewport, selection, dragOffset, items, marquee } = snapshot;
    drawGrid(snapshot);
    overlay.clear();
    if (items !== previousItems) {
      const ids = new Set(items.map((item) => item.id));
      for (const [id, view] of views) {
        if (!ids.has(id)) {
          view.container.destroy({ children: true });
          views.delete(id);
        }
      }
    }
    const screen = { x: -4, y: -4, width: viewport.width + 8, height: viewport.height + 8 };
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const selected = selection.has(item.id);
      const position = worldToScreen(
        { x: item.x + (selected ? dragOffset.x : 0), y: item.y + (selected ? dragOffset.y : 0) },
        camera,
      );
      const width = item.width * camera.zoom;
      const height = item.height * camera.zoom;
      let view = views.get(item.id);
      if (!intersects({ ...position, width, height }, screen)) {
        if (view) view.container.visible = false;
        continue;
      }
      if (!view) {
        view = createItem(item);
        views.set(item.id, view);
      }
      view.container.zIndex = index;
      view.container.visible = true;
      view.container.position.set(position.x, position.y);
      if (view.item !== item || view.zoom !== camera.zoom || view.selected !== selected) {
        view.rectangle
          .clear()
          .roundRect(0, 0, width, height, Math.min(10, height / 4, width / 4))
          .fill("#ffffff")
          .stroke({ color: selected ? "#6960d9" : "#d8d9e0", width: 1 });
        view.selected = selected;
      }
      if (view.item !== item || view.zoom !== camera.zoom) {
        // The font stays at 14 world units; text and its padding follow the camera scale.
        view.label.text = item.text;
        view.label.scale.set(camera.zoom);
        view.label.resolution = textResolution(camera.zoom);
        view.label.position.set(width / 2, height / 2);
        view.label.visible = item.width > 20 && item.height > 20;
        const padding = 10 * camera.zoom;
        // Most labels fit: avoid a separate mask pass for each visible rectangle.
        const clipped =
          view.label.visible &&
          (view.label.width > width - padding * 2 || view.label.height > height - padding * 2);
        view.label.mask = clipped ? view.clip : null;
        view.clip.visible = clipped;
        view.clip
          .clear()
          .rect(
            padding,
            padding,
            Math.max(0, width - padding * 2),
            Math.max(0, height - padding * 2),
          )
          .fill("#ffffff");
        view.item = item;
        view.zoom = camera.zoom;
      }
    }
    itemsLayer.sortableChildren = true;
    previousItems = items;
    if (marquee) {
      const position = worldToScreen(marquee, camera);
      overlay
        .rect(position.x, position.y, marquee.width * camera.zoom, marquee.height * camera.zoom)
        // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill accepts a style; this is not Array.fill.
        .fill(MARQUEE_FILL)
        .stroke({ color: "#6960d9", width: 1 });
    }
    canvas.style.cursor =
      snapshot.interaction === "pan" || snapshot.interaction === "pinch"
        ? "grabbing"
        : snapshot.interaction === "drag"
          ? "move"
          : snapshot.interaction === "marquee"
            ? "crosshair"
            : "default";
    app.render();
  }

  function normalize(event: PointerEvent): CanvasPointer {
    const bounds = canvas.getBoundingClientRect();
    return {
      id: event.pointerId,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      touch: event.pointerType === "touch",
      marquee: event.ctrlKey || event.metaKey,
      additive: event.shiftKey,
    };
  }

  function releasePointers() {
    for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    captured.clear();
  }

  function cancel() {
    controller.cancel();
    releasePointers();
  }

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      captured.add(event.pointerId);
      controller.pointerDown(normalize(event));
    },
    { signal: events.signal },
  );

  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (captured.has(event.pointerId)) controller.pointerMove(normalize(event));
      else if (event.pointerType !== "touch")
        canvas.style.cursor =
          event.ctrlKey || event.metaKey
            ? "crosshair"
            : controller.hitTest(normalize(event))
              ? "move"
              : "default";
    },
    { signal: events.signal },
  );

  canvas.addEventListener(
    "pointerup",
    (event) => {
      controller.pointerUp(normalize(event));
      captured.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    },
    { signal: events.signal },
  );

  canvas.addEventListener("pointercancel", cancel, { signal: events.signal });
  canvas.addEventListener(
    "lostpointercapture",
    (event) => {
      if (captured.has(event.pointerId)) cancel();
    },
    { signal: events.signal },
  );
  // macOS Control-click would otherwise open the native menu during marquee selection.
  canvas.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      controller.zoomTo(
        controller.getSnapshot().camera.zoom * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)),
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      );
    },
    { passive: false, signal: events.signal },
  );

  canvas.addEventListener(
    "keydown",
    (event) => {
      if (event.target !== canvas || event.isComposing) return;
      const command = commandForKey(event);
      if (!command) return;
      event.preventDefault();
      controller.command(command);
      releasePointers();
    },
    { signal: events.signal },
  );
  canvas.addEventListener("blur", cancel, { signal: events.signal });
  window.addEventListener("blur", cancel, { signal: events.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) cancel();
    },
    { signal: events.signal },
  );

  function resize() {
    if (destroyed) return;
    resolution = window.devicePixelRatio || 1;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    app.renderer.resize(width, height, resolution);
    for (const view of views.values()) view.label.resolution = textResolution(view.zoom);
    controller.resize({ width, height });
    invalidate();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener("resize", resize, { signal: events.signal });
  let densityQuery: MediaQueryList;
  function watchDensity() {
    densityQuery?.removeEventListener("change", onDensityChange);
    densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    densityQuery.addEventListener("change", onDensityChange, { once: true });
  }
  function onDensityChange() {
    resize();
    watchDensity();
  }
  watchDensity();
  const unsubscribe = controller.subscribe(invalidate);
  resize();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    events.abort();
    cancel();
    unsubscribe();
    observer.disconnect();
    densityQuery.removeEventListener("change", onDensityChange);
    options.signal?.removeEventListener("abort", destroy);
    cancelAnimationFrame(frame);
    views.clear();
    app.destroy(true, { children: true, texture: true, textureSource: true });
  }
  options.signal?.addEventListener("abort", destroy, { once: true });
  return { destroy, focus: () => canvas.focus({ preventScroll: true }) };
}
