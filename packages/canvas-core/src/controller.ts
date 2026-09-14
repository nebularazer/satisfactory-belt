import { boundsBetween, contains, fitCamera, intersects, screenToWorld, zoomAt } from "./geometry";
import type { Bounds, Camera, Point, Size } from "./geometry";
import { snapToGrid } from "./grid";

/** Geometry belongs to the host. The canvas only retains a temporary move preview. */
export type CanvasItem = Bounds & Readonly<{ id: string; text: string }>;
export type ItemMove = Point & Readonly<{ id: string }>;
export type CanvasCommand = "reset" | "fit" | "zoom-in" | "zoom-out" | "actual-size" | "escape";
export type CanvasPointer = Point &
  Readonly<{ id: number; touch?: boolean; marquee?: boolean; additive?: boolean }>;

type Gesture = {
  kind: "pan" | "drag" | "marquee";
  pointerId: number;
  start: Point;
  last: CanvasPointer;
  camera: Camera;
  selection: ReadonlySet<string>;
  moved: boolean;
  additive: boolean;
  dragOrigin: Point | null;
};

type Pinch = {
  camera: Camera;
  center: Point;
  distance: number;
  selection: ReadonlySet<string>;
  ids: readonly [number, number];
};

export type CanvasSnapshot = Readonly<{
  items: readonly CanvasItem[];
  camera: Camera;
  viewport: Size;
  selection: ReadonlySet<string>;
  dragOffset: Point;
  gridSnapping: boolean;
  marquee: Bounds | null;
  interaction: "idle" | "pan" | "drag" | "marquee" | "pinch";
}>;

const ORIGIN: Camera = { x: 0, y: 0, zoom: 1 };
const ZERO: Point = { x: 0, y: 0 };
const DRAG_THRESHOLD = 4;

export class CanvasController {
  private items: readonly CanvasItem[];
  private camera: Camera = ORIGIN;
  private viewport: Size = { width: 0, height: 0 };
  private selection: ReadonlySet<string> = new Set();
  private dragOffset: Point = ZERO;
  private gridSnapping = true;
  private marquee: Bounds | null = null;
  private gesture: Gesture | null = null;
  private pinch: Pinch | null = null;
  private pointers = new Map<number, CanvasPointer>();
  private waitForRelease = false;
  private listeners = new Set<() => void>();
  private onMove: (moves: readonly ItemMove[]) => void;

  constructor(options: {
    items: readonly CanvasItem[];
    onMove: (moves: readonly ItemMove[]) => void;
  }) {
    this.items = options.items;
    this.onMove = options.onMove;
  }

  getSnapshot = (): CanvasSnapshot => ({
    items: this.items,
    camera: this.camera,
    viewport: this.viewport,
    selection: this.selection,
    dragOffset: this.dragOffset,
    gridSnapping: this.gridSnapping,
    marquee: this.marquee,
    interaction: this.pinch ? "pinch" : (this.gesture?.kind ?? "idle"),
  });

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  setGridSnapping = (enabled: boolean) => {
    if (this.gridSnapping === enabled) return;
    this.gridSnapping = enabled;
    if (this.gesture?.kind === "drag" && this.gesture.moved) this.pointerMove(this.gesture.last);
    else this.emit();
  };

  setItems(items: readonly CanvasItem[]) {
    this.cancel();
    this.items = items;
    const ids = new Set(items.map((item) => item.id));
    this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
    this.emit();
  }

  resize(viewport: Size) {
    if (viewport.width === this.viewport.width && viewport.height === this.viewport.height) return;
    this.cancel();
    if (this.viewport.width > 0 && this.viewport.height > 0) {
      this.camera = {
        ...this.camera,
        x: this.camera.x + (viewport.width - this.viewport.width) / 2,
        y: this.camera.y + (viewport.height - this.viewport.height) / 2,
      };
    }
    this.viewport = viewport;
    this.emit();
  }

  hitTest(screen: Point): CanvasItem | undefined {
    const point = screenToWorld(screen, this.camera);
    for (let index = this.items.length - 1; index >= 0; index--) {
      const item = this.items[index]!;
      if (contains(item, point)) return item;
    }
    return undefined;
  }

  pointerDown(pointer: CanvasPointer) {
    this.pointers.set(pointer.id, pointer);
    if (this.waitForRelease) return;
    const touches = [...this.pointers.values()].filter((entry) => entry.touch);
    if (touches.length === 2 && !this.pinch) {
      const a = touches[0]!;
      const b = touches[1]!;
      // A second finger rolls back an item drag before taking over the camera.
      const selection = this.gesture?.selection ?? this.selection;
      if (this.gesture?.kind === "drag" || this.gesture?.kind === "marquee")
        this.selection = selection;
      this.dragOffset = ZERO;
      this.marquee = null;
      this.gesture = null;
      this.pinch = {
        camera: this.camera,
        center: midpoint(a, b),
        distance: Math.max(1, distance(a, b)),
        selection,
        ids: [a.id, b.id],
      };
      this.emit();
      return;
    }
    if (this.gesture || this.pinch || this.pointers.size > 1) return;
    const previousSelection = this.selection;
    const item = this.hitTest(pointer);
    let kind: Gesture["kind"] = "pan";
    if (pointer.marquee) {
      kind = "marquee";
    } else if (item) {
      if (pointer.additive) {
        const next = new Set(this.selection);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        this.selection = next;
        if (!next.has(item.id)) {
          this.emit();
          return;
        }
      } else if (!this.selection.has(item.id)) {
        this.selection = new Set([item.id]);
      }
      kind = "drag";
    }
    this.gesture = {
      kind,
      pointerId: pointer.id,
      start: pointer,
      last: pointer,
      camera: this.camera,
      selection: previousSelection,
      moved: false,
      additive: pointer.additive ?? false,
      dragOrigin: kind === "drag" && item ? { x: item.x, y: item.y } : null,
    };
    this.emit();
  }

  pointerMove(pointer: CanvasPointer) {
    if (!this.pointers.has(pointer.id)) return;
    this.pointers.set(pointer.id, pointer);
    if (this.waitForRelease) return;
    if (this.pinch) {
      const a = this.pointers.get(this.pinch.ids[0]);
      const b = this.pointers.get(this.pinch.ids[1]);
      if (!a || !b) return;
      const center = midpoint(a, b);
      const zoomed = zoomAt(
        this.pinch.camera,
        this.pinch.center,
        (this.pinch.camera.zoom * distance(a, b)) / this.pinch.distance,
      );
      this.camera = {
        ...zoomed,
        x: zoomed.x + center.x - this.pinch.center.x,
        y: zoomed.y + center.y - this.pinch.center.y,
      };
      this.emit();
      return;
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    gesture.last = pointer;
    if (!gesture.moved && distance(gesture.start, pointer) < DRAG_THRESHOLD) return;
    gesture.moved = true;
    const delta = { x: pointer.x - gesture.start.x, y: pointer.y - gesture.start.y };
    if (gesture.kind === "pan") {
      this.camera = {
        ...gesture.camera,
        x: gesture.camera.x + delta.x,
        y: gesture.camera.y + delta.y,
      };
    } else if (gesture.kind === "drag") {
      const offset = { x: delta.x / gesture.camera.zoom, y: delta.y / gesture.camera.zoom };
      const origin = gesture.dragOrigin!;
      // Snap the grabbed item's origin, preserving pointer offset and group spacing.
      this.dragOffset = this.gridSnapping
        ? {
            x: snapToGrid(origin.x + offset.x) - origin.x,
            y: snapToGrid(origin.y + offset.y) - origin.y,
          }
        : offset;
    } else {
      this.marquee = boundsBetween(
        screenToWorld(gesture.start, this.camera),
        screenToWorld(pointer, this.camera),
      );
      const next = new Set(gesture.additive ? gesture.selection : []);
      for (const item of this.items) if (intersects(item, this.marquee)) next.add(item.id);
      this.selection = next;
    }
    this.emit();
  }

  pointerUp(pointer: CanvasPointer) {
    if (!this.pointers.has(pointer.id)) return;
    this.pointerMove(pointer);
    this.pointers.delete(pointer.id);
    if (this.pinch) {
      if (!this.pinch.ids.includes(pointer.id)) return;
      this.pinch = null;
      this.waitForRelease = this.pointers.size > 0;
      this.emit();
      return;
    }
    if (this.waitForRelease) {
      this.waitForRelease = this.pointers.size > 0;
      return;
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    const moves =
      gesture.kind === "drag" && gesture.moved
        ? this.items
            .filter((item) => this.selection.has(item.id))
            .map((item) => ({
              id: item.id,
              x: item.x + this.dragOffset.x,
              y: item.y + this.dragOffset.y,
            }))
        : [];
    if (
      !gesture.moved &&
      (gesture.kind === "pan" || gesture.kind === "marquee") &&
      !gesture.additive
    )
      this.selection = new Set();
    this.gesture = null;
    this.dragOffset = ZERO;
    this.marquee = null;
    // The host applies the committed geometry with setItems, once per gesture.
    if (moves.length) this.onMove(moves);
    this.emit();
  }

  cancel() {
    const active = this.gesture ?? this.pinch;
    if (active) {
      this.camera = active.camera;
      this.selection = active.selection;
    }
    this.gesture = null;
    this.pinch = null;
    this.dragOffset = ZERO;
    this.marquee = null;
    this.pointers.clear();
    this.waitForRelease = false;
    if (active) this.emit();
  }

  zoomTo(
    zoom: number,
    anchor: Point = { x: this.viewport.width / 2, y: this.viewport.height / 2 },
  ) {
    if (this.gesture || this.pinch || this.waitForRelease) return;
    this.camera = zoomAt(this.camera, anchor, zoom);
    this.emit();
  }

  command(command: CanvasCommand) {
    if (command === "escape") {
      if (this.gesture || this.pinch || this.waitForRelease) this.cancel();
      else {
        this.selection = new Set();
        this.emit();
      }
      return;
    }
    this.cancel();
    if (command === "reset") this.camera = ORIGIN;
    else if (command === "fit") this.camera = fitCamera(this.items, this.viewport);
    else {
      this.zoomTo(
        command === "actual-size" ? 1 : this.camera.zoom * (command === "zoom-in" ? 1.2 : 1 / 1.2),
      );
      return;
    }
    this.emit();
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function commandForKey(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): CanvasCommand | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  if (event.key === "Escape") return "escape";
  if (event.shiftKey && event.code === "Digit1") return "fit";
  if (event.key === "0") return "reset";
  if (event.key === "+" || event.key === "=") return "zoom-in";
  if (event.key === "-") return "zoom-out";
  return undefined;
}
