import { boundsBetween, contains, fitCamera, intersects, screenToWorld, zoomAt } from "./geometry";
import type { Bounds, Camera, Point, Size } from "./geometry";
import { SNAP_SIZE, snapToGrid } from "./grid";
import {
  emptyLinkSelection,
  hitTestLinks,
  segmentGuides,
  routeLink,
  translateGuides,
} from "./links";
import type { CanvasLink, LinkHit, LinkSelection, RouteGuide } from "./links";
import { emptyPortSelection, hitTestPorts, portId, samePort } from "./ports";
import type { CanvasPort, PortCompatibility, PortReference, PortSelection } from "./ports";

/** Geometry belongs to the host. The canvas only retains a temporary move preview. */
export type CanvasItem = Bounds & Readonly<{ id: string }>;
export type ItemMove = Point & Readonly<{ id: string }>;
export type MoveContext = Readonly<{ group: object }>;
export type CanvasCommand =
  | "reset"
  | "fit"
  | "zoom-in"
  | "zoom-out"
  | "actual-size"
  | "escape"
  | "move-left"
  | "move-right"
  | "move-up"
  | "move-down";
export type CanvasPointer = Point &
  Readonly<{ id: number; touch?: boolean; marquee?: boolean; additive?: boolean }>;

type Gesture = {
  kind: "pan" | "drag" | "marquee" | "port" | "link" | "segment";
  linkHits?: readonly LinkHit[];
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
  ports: PortSelection;
  links: readonly CanvasLink[];
  linkSelection: LinkSelection;
  items: readonly CanvasItem[];
  camera: Camera;
  viewport: Size;
  selection: ReadonlySet<string>;
  dragOffset: Point;
  gridSnapping: boolean;
  marquee: Bounds | null;
  interaction: "idle" | "pan" | "drag" | "marquee" | "pinch" | "port" | "link" | "segment";
}>;

const ORIGIN: Camera = { x: 0, y: 0, zoom: 1 };
const ZERO: Point = { x: 0, y: 0 };
const DRAG_THRESHOLD = 4;

export class CanvasController {
  private links: readonly CanvasLink[] = [];
  private linkState: LinkSelection = emptyLinkSelection();
  private linkPreviewCache: {
    links: readonly CanvasLink[];
    preview: LinkSelection["preview"];
    offset: Point;
    selection: ReadonlySet<string>;
    result: readonly CanvasLink[];
  } | null = null;
  private onConnect?: (a: PortReference, b: PortReference) => PortCompatibility;
  private onRoute?: (id: string, guides: readonly RouteGuide[]) => void;
  private portGeometry: readonly CanvasPort[] = [];
  private portState: PortSelection = emptyPortSelection();
  private hoverPoint: CanvasPointer | null = null;
  private compatibility: (a: PortReference, b: PortReference) => PortCompatibility = () => ({
    compatible: false,
    reason: "missing-port",
  });
  private targets: (a: PortReference) => readonly PortReference[] = () => [];
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
  private onMove: (moves: readonly ItemMove[], context?: MoveContext) => void;

  constructor(options: {
    items: readonly CanvasItem[];
    onConnect?: (a: PortReference, b: PortReference) => PortCompatibility;
    onRoute?: (id: string, guides: readonly RouteGuide[]) => void;
    onMove: (moves: readonly ItemMove[], context?: MoveContext) => void;
  }) {
    this.onConnect = options.onConnect;
    this.onRoute = options.onRoute;
    this.items = options.items;
    this.onMove = options.onMove;
  }

  getSnapshot = (): CanvasSnapshot => ({
    ports: this.portState,
    links: this.getVisibleLinks(),
    linkSelection: this.linkState,
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
    if (this.hoverPoint && !this.gesture && !this.pinch) {
      const hover = this.portHits(this.hoverPoint);
      if (hover.map(portId).join() !== this.portState.hover.map(portId).join())
        this.portState = { ...this.portState, hover };
    }
    for (const listener of this.listeners) listener();
  }

  getLinkSnapshot = () => this.linkState;
  setLinks(links: readonly CanvasLink[]) {
    this.links = links;
    if (this.linkState.selected && !links.some((link) => link.id === this.linkState.selected))
      this.linkState = emptyLinkSelection();
  }
  selectLink = (id: string) => {
    if (!this.links.some((link) => link.id === id)) return;
    this.cancel(false);
    this.selection = new Set();
    this.portState = emptyPortSelection();
    this.linkState = { selected: id, focusedSegment: null, chooser: null, preview: null };
    this.emit();
  };
  chooseLinkHit = (hit: LinkHit) => {
    this.selectLink(hit.id);
    this.linkState = { ...this.linkState, focusedSegment: hit.segment };
    this.emit();
  };
  dismissLinkChooser = () => {
    this.linkState = { ...this.linkState, chooser: null };
    this.emit();
  };
  private getVisibleLinks(): readonly CanvasLink[] {
    if (!this.dragOffset.x && !this.dragOffset.y && !this.linkState.preview) return this.links;
    const cached = this.linkPreviewCache;
    if (
      cached &&
      cached.links === this.links &&
      cached.preview === this.linkState.preview &&
      cached.offset === this.dragOffset &&
      cached.selection === this.selection
    )
      return cached.result;
    const result = this.links.map((link) => {
      const sourceMoved = this.selection.has(link.output.nodeId),
        targetMoved = this.selection.has(link.input.nodeId);
      const preview = this.linkState.preview?.id === link.id ? this.linkState.preview : null;
      if (
        !preview &&
        ((!this.dragOffset.x && !this.dragOffset.y) || (!sourceMoved && !targetMoved))
      )
        return link;
      const move = (point: Point, moved: boolean) =>
        moved ? { x: point.x + this.dragOffset.x, y: point.y + this.dragOffset.y } : point;
      const guides =
        preview?.guides ??
        (sourceMoved && targetMoved ? translateGuides(link.guides, this.dragOffset) : link.guides);
      return {
        ...link,
        points: routeLink(
          move(link.points[0]!, sourceMoved),
          move(link.points.at(-1)!, targetMoved),
          [],
          guides,
        ),
      };
    });
    this.linkPreviewCache = {
      links: this.links,
      preview: this.linkState.preview,
      offset: this.dragOffset,
      selection: this.selection,
      result,
    };
    return result;
  }

  getPortSnapshot = () => this.portState;

  /** Publish port metadata before setItems emits the matching document revision. */
  setPorts(
    ports: readonly CanvasPort[],
    compatibility = this.compatibility,
    targets = this.targets,
  ) {
    this.portGeometry = ports;
    this.compatibility = compatibility;
    this.targets = targets;
    const exists = (ref: PortReference) => ports.some((port) => samePort(port, ref));
    if (this.portState.anchor && !exists(this.portState.anchor))
      this.portState = emptyPortSelection();
    const anchor = this.portState.anchor;
    this.portState = {
      ...this.portState,
      pending: [],
      chooser: null,
      compatible: new Set(anchor ? targets(anchor).map(portId) : []),
      preview:
        anchor && this.portState.preview && compatibility(anchor, this.portState.preview).compatible
          ? this.portState.preview
          : null,
    };
  }

  private portHits(pointer: CanvasPointer) {
    return hitTestPorts(
      pointer,
      pointer.touch ?? false,
      this.camera,
      this.items,
      this.portGeometry,
      this.selection,
      this.dragOffset,
    );
  }

  hoverPort(pointer: CanvasPointer | null) {
    this.hoverPoint = pointer;
    const hover = pointer ? this.portHits(pointer) : [];
    if (hover.map(portId).join() === this.portState.hover.map(portId).join()) return;
    this.portState = { ...this.portState, hover };
    this.emit();
  }

  dismissPortChooser = () => {
    this.portState = { ...this.portState, chooser: null };
    this.emit();
  };

  clearPorts = () => {
    this.portState = emptyPortSelection();
    this.emit();
  };

  selectPort = (ref: PortReference) => {
    const port = this.portGeometry.find((entry) => samePort(entry, ref));
    if (!port) return;
    this.linkState = emptyLinkSelection();
    const anchor = this.portGeometry.find((entry) => samePort(entry, this.portState.anchor));
    if (samePort(anchor ?? null, port)) {
      this.clearPorts();
      return;
    }
    if (!anchor || anchor.direction === port.direction) {
      this.selection = new Set([port.nodeId]);
      this.portState = {
        ...emptyPortSelection(),
        anchor: ref,
        compatible: new Set(this.targets(ref).map(portId)),
      };
    } else {
      let result = this.compatibility(anchor, port);
      if (result.compatible && this.onConnect) {
        result = this.onConnect(anchor, port);
        if (result.compatible) {
          this.clearPorts();
          return;
        }
      }
      this.portState = {
        ...this.portState,
        chooser: null,
        pending: [],
        preview: result.compatible ? ref : this.portState.preview,
      };
    }
    this.emit();
  };

  setGridSnapping = (enabled: boolean) => {
    if (this.gridSnapping === enabled) return;
    this.gridSnapping = enabled;
    if ((this.gesture?.kind === "drag" || this.gesture?.kind === "segment") && this.gesture.moved)
      this.pointerMove(this.gesture.last);
    else this.emit();
  };

  setItems(items: readonly CanvasItem[]) {
    const hoverPoint = this.hoverPoint;
    this.cancel(false);
    this.hoverPoint = hoverPoint;
    this.items = items;
    const ids = new Set(items.map((item) => item.id));
    this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
    this.emit();
  }

  setSelection(ids: ReadonlySet<string>) {
    this.cancel();
    this.portState = emptyPortSelection();
    this.linkState = emptyLinkSelection();
    this.selection = new Set(this.items.filter((item) => ids.has(item.id)).map((item) => item.id));
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

  getCursor(pointer = this.hoverPoint): string {
    if (this.pinch || this.gesture?.kind === "pan") return "grabbing";
    if (this.gesture?.kind === "drag") return "move";
    if (this.gesture?.kind === "marquee" || pointer?.marquee) return "crosshair";
    if (this.gesture?.kind === "segment") {
      const hit = this.gesture.linkHits![0]!;
      const points = this.links.find((link) => link.id === hit.id)?.points;
      return points && points[hit.segment]!.x === points[hit.segment + 1]!.x
        ? "col-resize"
        : "row-resize";
    }
    if (!pointer) return "default";
    const ports = this.portHits(pointer);
    if (ports.length) {
      const anchor = this.portGeometry.find((port) => samePort(port, this.portState.anchor));
      const invalid =
        anchor &&
        ports.every(
          (port) =>
            port.direction !== anchor.direction && !this.compatibility(anchor, port).compatible,
        );
      return invalid ? "not-allowed" : "pointer";
    }
    if (this.hitTest(pointer)) return "move";
    const handles = hitTestLinks(
      pointer,
      !!pointer.touch,
      this.camera,
      this.links,
      this.linkState.selected,
      true,
    );
    if (handles.length === 1) {
      const hit = handles[0]!,
        points = this.links.find((link) => link.id === hit.id)!.points;
      return points[hit.segment]!.x === points[hit.segment + 1]!.x ? "col-resize" : "row-resize";
    }
    return hitTestLinks(pointer, !!pointer.touch, this.camera, this.links, this.linkState.selected)
      .length
      ? "pointer"
      : "default";
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
    this.hoverPoint = pointer.touch ? null : pointer;
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
      this.linkState = { ...this.linkState, preview: null, chooser: null };
      this.gesture = null;
      this.portState = { ...this.portState, pending: [], chooser: null, hover: [] };
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
    const candidates = !pointer.marquee && !pointer.additive ? this.portHits(pointer) : [];
    this.portState = { ...this.portState, chooser: null };
    this.linkState = { ...this.linkState, chooser: null };
    let handles =
      !pointer.marquee && !pointer.additive && !item
        ? hitTestLinks(
            pointer,
            !!pointer.touch,
            this.camera,
            this.links,
            this.linkState.selected,
            true,
          )
        : [];
    const focused = handles.find((hit) => hit.segment === this.linkState.focusedSegment);
    if (focused) handles = [focused];
    const linkHits = handles.length
      ? handles
      : !item && !pointer.marquee && !pointer.additive
        ? hitTestLinks(pointer, !!pointer.touch, this.camera, this.links, this.linkState.selected)
        : [];
    if (candidates.length) {
      kind = "port";
      this.portState = { ...this.portState, pending: candidates };
    } else if (linkHits.length) {
      kind = handles.length === 1 ? "segment" : "link";
      this.portState = emptyPortSelection();
    } else if (pointer.marquee) {
      this.linkState = emptyLinkSelection();
      kind = "marquee";
      this.portState = emptyPortSelection();
    } else if (item) {
      this.linkState = emptyLinkSelection();
      this.portState = emptyPortSelection();
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
      linkHits,
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
    if (!pointer.touch) this.hoverPoint = pointer;
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
    if (
      !gesture.moved &&
      (gesture.last.touch
        ? distance(gesture.start, pointer) <= 10
        : distance(gesture.start, pointer) < DRAG_THRESHOLD)
    )
      return;
    gesture.moved = true;
    if (gesture.kind === "port" || gesture.kind === "link") {
      gesture.kind = "pan";
      this.portState = { ...this.portState, pending: [], hover: [] };
    }
    const delta = { x: pointer.x - gesture.start.x, y: pointer.y - gesture.start.y };
    if (gesture.kind === "segment") {
      const hit = gesture.linkHits![0]!;
      const link = this.links.find((entry) => entry.id === hit.id)!;
      const a = link.points[hit.segment]!,
        b = link.points[hit.segment + 1]!;
      const axis = a.x === b.x ? "x" : "y";
      const value = a[axis] + delta[axis] / gesture.camera.zoom;
      this.linkState = {
        ...this.linkState,
        preview: {
          id: link.id,
          guides: segmentGuides(
            link.points,
            hit.segment,
            this.gridSnapping ? snapToGrid(value) : value,
          ),
        },
      };
    } else if (gesture.kind === "pan") {
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
    if (gesture.kind === "segment" || gesture.kind === "link") {
      this.gesture = null;
      const preview = this.linkState.preview;
      this.linkState = { ...this.linkState, preview: null };
      if (gesture.moved && preview) this.onRoute?.(preview.id, preview.guides);
      else {
        const hits = gesture.linkHits!;
        if (hits.length === 1) this.selectLink(hits[0]!.id);
        else this.linkState = { ...this.linkState, chooser: { point: pointer, candidates: hits } };
      }
      this.emit();
      return;
    }
    if (gesture.kind === "port") {
      const candidates = this.portState.pending;
      this.gesture = null;
      this.portState = { ...this.portState, pending: [] };
      if (candidates.length === 1) this.selectPort(candidates[0]!);
      else if (candidates.length > 1) {
        this.portState = { ...this.portState, chooser: { point: pointer, candidates } };
        this.emit();
      }
      return;
    }
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
    if (!gesture.moved && gesture.kind === "marquee") {
      const item = this.hitTest(gesture.start);
      if (item) {
        const next = new Set(gesture.selection);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        this.selection = next;
      } else if (!gesture.additive) this.selection = new Set();
    } else if (!gesture.moved && gesture.kind === "pan" && !gesture.additive) {
      this.selection = new Set();
      this.linkState = emptyLinkSelection();
      this.portState = emptyPortSelection();
    }
    this.gesture = null;
    this.dragOffset = ZERO;
    this.marquee = null;
    // The host applies the committed geometry with setItems, once per gesture.
    if (moves.length) this.onMove(moves);
    this.emit();
  }

  cancel(notify = true) {
    const transient = this.portState.pending.length || this.portState.hover.length;
    this.hoverPoint = null;
    this.linkState = { ...this.linkState, preview: null };
    this.portState = { ...this.portState, pending: [], hover: [] };
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
    if (notify && (active || transient)) this.emit();
  }

  zoomTo(
    zoom: number,
    anchor: Point = { x: this.viewport.width / 2, y: this.viewport.height / 2 },
  ) {
    if (this.gesture || this.pinch || this.waitForRelease) return;
    this.camera = zoomAt(this.camera, anchor, zoom);
    this.emit();
  }

  command(command: CanvasCommand, context?: MoveContext) {
    if (
      command === "move-left" ||
      command === "move-right" ||
      command === "move-up" ||
      command === "move-down"
    ) {
      if (this.gesture || this.pinch || this.waitForRelease || this.pointers.size) return;
      const selected = this.items.filter((item) => this.selection.has(item.id));
      if (!selected.length) return;
      const horizontal = command === "move-left" || command === "move-right";
      const direction = command === "move-left" || command === "move-up" ? -1 : 1;
      const origin = selected.reduce(
        (min, item) => Math.min(min, horizontal ? item.x : item.y),
        Infinity,
      );
      // An off-grid selection reaches the next grid line in the requested direction.
      // One shared offset preserves the group's layout; zoom never changes the step.
      const offset = this.gridSnapping
        ? ((direction > 0 ? Math.floor(origin / SNAP_SIZE) : Math.ceil(origin / SNAP_SIZE)) +
            direction) *
            SNAP_SIZE -
          origin
        : direction;
      const moves = selected.map((item) => ({
        id: item.id,
        x: item.x + (horizontal ? offset : 0),
        y: item.y + (horizontal ? 0 : offset),
      }));
      if (context) this.onMove(moves, context);
      else this.onMove(moves);
      this.emit();
      return;
    }
    if (command === "escape") {
      if (this.portState.anchor || this.portState.chooser || this.portState.pending.length) {
        this.cancel();
        this.clearPorts();
        return;
      }
      if (this.gesture || this.pinch || this.waitForRelease) this.cancel();
      else {
        this.selection = new Set();
        this.linkState = emptyLinkSelection();
        this.emit();
      }
      return;
    }
    const hoverPoint = this.hoverPoint;
    this.cancel(false);
    this.hoverPoint = hoverPoint;
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
  if (!event.shiftKey) {
    if (event.key === "ArrowLeft") return "move-left";
    if (event.key === "ArrowRight") return "move-right";
    if (event.key === "ArrowUp") return "move-up";
    if (event.key === "ArrowDown") return "move-down";
  }
  if (event.key === "0") return "reset";
  if (event.key === "+" || event.key === "=") return "zoom-in";
  if (event.key === "-") return "zoom-out";
  return undefined;
}

export function historyCommandForKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): "undo" | "redo" | undefined {
  if (event.altKey || (!event.ctrlKey && !event.metaKey)) return undefined;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return undefined;
}

export function clipboardCommandForKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): "copy" | "paste" | undefined {
  if (event.altKey || event.shiftKey || (!event.ctrlKey && !event.metaKey)) return undefined;
  const key = event.key.toLowerCase();
  if (key === "c") return "copy";
  if (key === "v") return "paste";
  return undefined;
}

export function deleteCommandForKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): "delete" | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return undefined;
  if (event.key === "Delete" || event.key === "Backspace") return "delete";
  return undefined;
}
