import {
  CanvasController,
  commandForKey,
  historyCommandForKey,
  intersects,
  worldToScreen,
} from "@satisfactory-belt/canvas-core";
import type { CanvasItem, CanvasPointer } from "@satisfactory-belt/canvas-core";
import { PIPE_PORT_RADIUS, PORT_RADIUS } from "@satisfactory-belt/factory-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import type { IconManifest } from "@satisfactory-belt/game-data";
import { Application, Container, Graphics } from "pixi.js";

import { createGrid } from "./grid";
import { IconCache } from "./icon-cache";
import { MachineNodeView } from "./machine-node";
import { drawMaterialLinks } from "./material-links";
import { RenderPerformance } from "./performance";
import { CANVAS_PALETTES } from "./theme";
import type { CanvasTheme } from "./theme";

export type { CanvasTheme } from "./theme";

export { RenderPerformance } from "./performance";

export type CanvasView = {
  destroy: () => void;
  focus: () => void;
  setTheme: (theme: CanvasTheme) => void;
  setShowGrid: (visible: boolean) => void;
  performance: RenderPerformance;
  setShowPerformance: (visible: boolean) => void;
};

/** Owns browser resources; abort also cleans up an initialization still in flight. */
export async function mountCanvas(
  host: HTMLElement,
  controller: CanvasController,
  options: {
    getDisplay: (id: string) => NodeDisplay | undefined;
    iconManifest: IconManifest;
    assetBaseUrl: string;
    theme?: CanvasTheme;
    signal?: AbortSignal;
    fontFamily?: string;
    onHistoryCommand?: (command: "undo" | "redo") => void;
  },
): Promise<CanvasView> {
  const monitor = new RenderPerformance();
  const abortedView: CanvasView = {
    destroy() {},
    focus() {},
    setTheme() {},
    setShowGrid() {},
    setShowPerformance() {},
    performance: monitor,
  };
  let palette = CANVAS_PALETTES[options.theme ?? "light"];
  const app = new Application();
  const fontFamily = options.fontFamily ?? "sans-serif";
  await Promise.all(
    [400, 500, 600].map((weight) => document.fonts.load(`${weight} 15px "${fontFamily}"`)),
  );
  if (options.signal?.aborted) return abortedView;
  await app.init({
    preference: ["webgl"],
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
    background: palette.background,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  if (options.signal?.aborted) {
    app.destroy(true, { children: true, texture: true, textureSource: true });
    return abortedView;
  }

  const canvas = app.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Canvas. Right-click empty space to add a node. Select a port then click empty space, or drag a port there, to search compatible nodes. Drag between compatible ports or select them in turn to connect. Select a link to move its segment handles. Delete removes selected nodes or links. Drag empty space to pan. Shift, Control, or Command and drag to select; modifier-click toggles an item. Arrow keys move selected items. Control or Command Z undoes; add Shift to redo. Scroll to zoom. 0 resets the view, Shift 1 fits all, plus and minus zoom.",
  );
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none;";
  app.stage.eventMode = "none";
  host.append(canvas);

  const grid = createGrid(palette.grid);
  const linksLayer = new Graphics();
  const linkHandlesLayer = new Graphics();
  const itemsLayer = new Container();
  const overlay = new Graphics();
  app.stage.addChild(grid.view, linksLayer, linkHandlesLayer, itemsLayer, overlay);
  const views = new Map<string, MachineNodeView>();
  const icons = new IconCache(options.iconManifest, options.assetBaseUrl, invalidate);
  let previousItems: readonly CanvasItem[] | null = null;
  let frame = 0;
  let destroyed = false;
  let contextLost = false;
  let showPerformance = false;
  let keyboardGroup: { code: string; token: object } | null = null;
  let resolution = window.devicePixelRatio || 1;
  const events = new AbortController();
  const captured = new Set<number>();

  function invalidate() {
    if (!destroyed && !contextLost && !frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (destroyed || contextLost) return;
    const started = monitor.enabled ? performance.now() : undefined;
    let visibleItems = 0;
    const snapshot = controller.getSnapshot();
    const { camera, viewport, selection, dragOffset, items, marquee } = snapshot;
    if (grid.view.visible) grid.update(camera, viewport, resolution);
    overlay.clear();
    drawMaterialLinks(linksLayer, linkHandlesLayer, snapshot, palette);
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
      const margin = (Math.max(PORT_RADIUS, PIPE_PORT_RADIUS) + 1) * camera.zoom + 64;
      if (
        !intersects(
          {
            x: position.x - margin,
            y: position.y - margin,
            width: width + margin * 2,
            height: height + margin * 2,
          },
          screen,
        )
      ) {
        if (view) view.container.visible = false;
        continue;
      }
      if (started !== undefined) visibleItems++;
      if (!view) {
        view = new MachineNodeView(fontFamily, icons);
        itemsLayer.addChild(view.container);
        views.set(item.id, view);
      }
      // Lift the dragged group above stationary nodes, preserving its internal order.
      view.container.zIndex =
        index + (snapshot.interaction === "drag" && selected ? items.length : 0);
      view.container.visible = true;
      view.container.position.set(position.x, position.y);
      const display = options.getDisplay(item.id);
      if (display) {
        view.update(display, camera.zoom, resolution, selected, palette);
        view.portHighlights.update(item.id, display, snapshot.ports, palette);
      } else view.container.visible = false;
    }

    itemsLayer.sortableChildren = true;
    previousItems = items;
    if (marquee) {
      const position = worldToScreen(marquee, camera);
      overlay
        .rect(position.x, position.y, marquee.width * camera.zoom, marquee.height * camera.zoom)
        // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill accepts a style; this is not Array.fill.
        .fill({ color: palette.selection, alpha: 0.09 })
        .stroke({ color: palette.selection, width: 1 });
    }
    canvas.style.cursor = controller.getCursor();
    app.render();
    if (started !== undefined)
      monitor.record(performance.now() - started, visibleItems, items.length);
  }

  function syncPerformance() {
    const enabled = showPerformance && !document.hidden && !contextLost && !destroyed;
    if (monitor.enabled === enabled) return;
    let visibleItems = 0;
    if (enabled) for (const view of views.values()) if (view.container.visible) visibleItems++;
    monitor.setEnabled(enabled, visibleItems, controller.getSnapshot().items.length);
  }

  function normalize(event: PointerEvent): CanvasPointer {
    const bounds = canvas.getBoundingClientRect();
    return {
      id: event.pointerId,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      touch: event.pointerType === "touch",
      marquee: event.shiftKey || event.ctrlKey || event.metaKey,
    };
  }

  function releasePointers() {
    for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    captured.clear();
  }

  function cancel() {
    keyboardGroup = null;
    controller.cancel();
    releasePointers();
  }

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      keyboardGroup = null;
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
      else if (event.pointerType !== "touch") {
        controller.hoverPort(normalize(event));
        canvas.style.cursor = controller.getCursor(normalize(event));
      }
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

  canvas.addEventListener("pointerleave", () => controller.hoverPort(null), {
    signal: events.signal,
  });
  canvas.addEventListener("pointercancel", cancel, { signal: events.signal });
  canvas.addEventListener(
    "lostpointercapture",
    (event) => {
      if (captured.has(event.pointerId)) cancel();
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      controller.openCatalogAt({
        id: -1,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
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
      const historyCommand = historyCommandForKey(event);
      if (historyCommand && options.onHistoryCommand) {
        event.preventDefault();
        cancel();
        options.onHistoryCommand(historyCommand);
        return;
      }
      const command = commandForKey(event);
      if (!command) return;
      event.preventDefault();
      if (command.startsWith("move-")) {
        if (!event.repeat || keyboardGroup?.code !== event.code)
          keyboardGroup = { code: event.code, token: {} };
        controller.command(command, { group: keyboardGroup.token });
      } else {
        keyboardGroup = null;
        controller.command(command);
        releasePointers();
      }
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "keyup",
    (event) => {
      if (keyboardGroup?.code === event.code) keyboardGroup = null;
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      contextLost = true;
      syncPerformance();
      cancelAnimationFrame(frame);
      frame = 0;
      cancel();
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "webglcontextrestored",
    () => {
      contextLost = false;
      syncPerformance();
      // Pixi releases the source canvases after text upload; the restored GPU textures
      // are empty until their managed text entries are regenerated.
      for (const view of views.values()) view.restoreText();
      invalidate();
    },
    { signal: events.signal },
  );
  canvas.addEventListener("blur", cancel, { signal: events.signal });
  window.addEventListener("blur", cancel, { signal: events.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) cancel();
      syncPerformance();
    },
    { signal: events.signal },
  );

  function resize() {
    if (destroyed) return;
    resolution = window.devicePixelRatio || 1;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    app.renderer.resize(width, height, resolution);
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
    monitor.destroy();
    events.abort();
    cancel();
    controller.clearPorts();
    unsubscribe();
    observer.disconnect();
    densityQuery.removeEventListener("change", onDensityChange);
    options.signal?.removeEventListener("abort", destroy);
    cancelAnimationFrame(frame);
    views.clear();
    grid.destroy();
    app.destroy(true, { children: true });
    icons.destroy();
  }
  options.signal?.addEventListener("abort", destroy, { once: true });
  return {
    destroy,
    performance: monitor,
    setTheme(theme) {
      const next = CANVAS_PALETTES[theme];
      if (destroyed || palette === next) return;
      palette = next;
      app.renderer.background.color = palette.background;
      grid.setColor(palette.grid);
      invalidate();
    },
    setShowPerformance(visible) {
      if (destroyed) return;
      showPerformance = visible;
      syncPerformance();
    },
    focus: () => canvas.focus({ preventScroll: true }),
    setShowGrid(visible) {
      if (destroyed || grid.view.visible === visible) return;
      grid.view.visible = visible;
      invalidate();
    },
  };
}
