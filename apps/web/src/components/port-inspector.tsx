/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- This bounded inspector renders only one node or chooser; callbacks capture its current port state. */
import { PORT_PALETTE, portId, samePort, worldToScreen } from "@satisfactory-belt/canvas-core";
import type { CanvasController, PortReference } from "@satisfactory-belt/canvas-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverDescription } from "@/components/ui/popover";
import type { GameAssets } from "@/lib/game-assets";

const restoreFocus = () => document.querySelector("canvas");
const reasons: Record<string, string> = {
  "same-node": "Choose a port on a different node.",
  "same-direction": "Choose an input and an output.",
  "different-material": "These ports carry different materials.",
  "different-transport": "These ports use different transport types.",
  "missing-port": "This port no longer exists.",
};

export function PortInspector({
  controller,
  getDisplay,
  assets,
}: {
  controller: CanvasController;
  getDisplay: (id: string) => NodeDisplay | undefined;
  assets: GameAssets;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getPortSnapshot);
  const selection = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().selection,
  );
  const items = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().items);
  const [inspected, setInspected] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [focusedPort, setFocusedPort] = useState(0);
  const lastSelection = useRef(selection);
  useEffect(() => {
    if (lastSelection.current !== selection) {
      lastSelection.current = selection;
      setInspected(null);
      setFocusedPort(0);
    }
  }, [selection]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const nodeIds = items.filter((item) => getDisplay(item.id)?.ports.length).map((item) => item.id);
  const nodeId =
    inspected && nodeIds.includes(inspected)
      ? inspected
      : [...selection].find((id) => nodeIds.includes(id));
  const display = nodeId ? getDisplay(nodeId) : undefined;
  const rows = display?.ports.map((port) => ({ nodeId: nodeId!, portKey: port.key })) ?? [];
  function describe(ref: PortReference | null) {
    if (!ref) return null;
    const node = getDisplay(ref.nodeId);
    const port = node?.ports.find((entry) => entry.key === ref.portKey);
    return node && port ? { node, port } : null;
  }
  function label(ref: PortReference | null) {
    const data = describe(ref);
    return data
      ? `${data.port.itemId === null ? `Any solid material · ${data.port.name}` : `${data.port.name} · ${data.port.direction}`} · ${data.node.title}${data.node.layout === "machine" ? ` · ${data.node.subtitle}` : ""}`
      : "";
  }
  function icon(ref: PortReference) {
    const data = describe(ref);
    const id = data?.port.iconId ?? data?.node.machineIconId;
    const path = id ? assets.icons.icons[id]?.variants[64].path : undefined;
    return path ? (
      <img
        src={new URL(path, assets.baseUrl).href}
        width={32}
        height={32}
        alt=""
        className="shrink-0"
      />
    ) : null;
  }
  const anchor = describe(state.anchor);
  const hover = describe(state.pending[0] ?? state.hover[0] ?? null);
  const status = (ref: PortReference) =>
    samePort(state.attempted?.port ?? null, ref)
      ? reasons[state.attempted!.reason]
      : samePort(state.anchor, ref)
        ? "Selected anchor"
        : samePort(state.preview, ref)
          ? "Preview target"
          : state.compatible.has(portId(ref))
            ? "Compatible target"
            : "";
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      controller.command("escape");
      document.querySelector("canvas")?.focus();
    }
  }
  function portRows(candidates: readonly PortReference[], chooser = false) {
    return (
      <fieldset
        className="flex flex-col gap-1"

        aria-label={chooser ? "Ports under pointer" : "Node ports"}
      >
        {candidates.map((ref, index) => (
          <Button
            key={portId(ref)}
            variant="ghost"
            className="h-auto min-h-12 w-full justify-start gap-3 px-3 py-2 text-left whitespace-normal focus-visible:ring-2"
            tabIndex={index === Math.min(focusedPort, candidates.length - 1) ? 0 : -1}
            aria-pressed={samePort(state.anchor, ref) || samePort(state.preview, ref)}
            onFocus={() => setFocusedPort(index)}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? candidates.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) %
                      candidates.length;
              const nextRow = event.currentTarget.parentElement?.children[next];
              if (nextRow instanceof HTMLElement) nextRow.focus();
            }}
            onClick={() => controller.selectPort(ref)}
          >
            {icon(ref)}
            <span className="min-w-0">
              <span className="block">
                {chooser
                  ? label(ref)
                  : describe(ref)?.port.itemId === null
                    ? `Any solid material · ${describe(ref)?.port.name}`
                    : `${describe(ref)?.port.name} · ${describe(ref)?.port.direction}`}
              </span>
              <span className="block text-xs text-muted-foreground">
                {describe(ref)?.port.transport} {status(ref) && `· ${status(ref)}`}
              </span>
            </span>
          </Button>
        ))}
      </fieldset>
    );
  }
  const attemptedPosition = useSyncExternalStore(controller.subscribe, () => {
    const snapshot = controller.getSnapshot();
    const attempted = snapshot.ports.attempted;
    if (!attempted) return "";
    const item = snapshot.items.find((entry) => entry.id === attempted.port.nodeId);
    const port = getDisplay(attempted.port.nodeId)?.ports.find(
      (entry) => entry.key === attempted.port.portKey,
    );
    if (!item || !port) return "";
    const point = worldToScreen({ x: item.x + port.x, y: item.y + port.y }, snapshot.camera);
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > snapshot.viewport.width ||
      point.y > snapshot.viewport.height
    )
      return "";
    const x = Math.max(
      8,
      Math.min(snapshot.viewport.width - 268, point.x + (port.direction === "input" ? -284 : 24)),
    );
    return `${x},${Math.max(8, Math.min(snapshot.viewport.height - 80, point.y - 24))}`;
  });
  const [attemptedX, attemptedY] = attemptedPosition.split(",").map(Number);
  const chooser = state.chooser;
  const close = (open: boolean) => {
    if (!open) controller.dismissPortChooser();
  };
  return (
    <>
      {!display && !anchor && nodeIds.length > 0 && (
        <Button
          variant="outline"
          className="absolute top-4 right-4 min-h-12 bg-background px-4 text-foreground"
          onClick={() => setInspected(nodeIds[0]!)}
        >
          Ports
        </Button>
      )}
      {(display || anchor) && (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape bubbles from the inspector buttons; preserve its named region.
        <section
          aria-label="Port inspector"
          onKeyDown={keyDown}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] max-h-[calc(100dvh-7rem)] w-[min(20rem,calc(100vw-5rem))] overflow-y-auto rounded-xl border bg-background p-3 text-sm text-foreground shadow-sm max-sm:max-h-[45dvh]"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">Ports</h2>
            <Button variant="ghost" className="min-h-12 px-4" onClick={controller.clearPorts}>
              Clear
            </Button>
          </div>
          <output aria-live="polite" className="block space-y-2 break-words">
            {anchor && (
              <div
                className="rounded-lg border-l-4 bg-muted/40 p-2"
                style={{ borderColor: PORT_PALETTE.anchor }}
              >
                <p className="font-medium">Selected {anchor.port.direction}</p>
                <div className="flex items-center gap-2">
                  {icon(state.anchor!)}
                  <p>{label(state.anchor)}</p>
                </div>
                <p>{anchor.port.transport}</p>
                <p>
                  {state.compatible.size
                    ? `${state.compatible.size} compatible ${anchor.port.direction === "output" ? "inputs" : "outputs"}`
                    : `No compatible ${anchor.port.direction === "output" ? "inputs" : "outputs"}`}
                </p>
                {state.preview && <p>Preview target: {label(state.preview)}</p>}
              </div>
            )}
            {state.attempted && (
              <p className="rounded-md bg-red-50 p-2" style={{ color: PORT_PALETTE.invalid }}>
                {label(state.attempted.port)}:{" "}
                {reasons[state.attempted.reason] ?? state.attempted.reason}
              </p>
            )}
          </output>
          <nav aria-label="Inspect node" className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              className="min-h-12 px-3"
              disabled={!nodeIds.length}
              onClick={() => {
                setInspected(
                  nodeIds[(nodeIds.indexOf(nodeId ?? "") - 1 + nodeIds.length) % nodeIds.length]!,
                );
                setFocusedPort(0);
              }}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              className="min-h-12 px-3"
              disabled={!nodeIds.length}
              onClick={() => {
                setInspected(nodeIds[(nodeIds.indexOf(nodeId ?? "") + 1) % nodeIds.length]!);
                setFocusedPort(0);
              }}
            >
              Next
            </Button>
          </nav>
          {display && (
            <>
              <h3 className="px-3 font-medium">{display.title}</h3>
              {display.layout === "machine" && (
                <p className="px-3 text-muted-foreground">{display.subtitle}</p>
              )}
              {portRows(rows)}
            </>
          )}
        </section>
      )}
      {hover && !chooser && (
        <output className="pointer-events-none absolute bottom-16 left-4 max-w-[calc(100vw-2rem)] rounded-lg border bg-background px-3 py-2 text-sm text-foreground shadow-sm">
          {label(state.pending[0] ?? state.hover[0] ?? null)} · {hover.port.transport}
        </output>
      )}
      {state.attempted && attemptedPosition && (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute z-10 w-65 rounded-lg border bg-red-50 p-2 text-sm shadow-sm"
          style={{ left: attemptedX, top: attemptedY, color: PORT_PALETTE.invalid }}
        >
          {reasons[state.attempted.reason] ?? state.attempted.reason}
        </p>
      )}
      {narrow ? (
        <Drawer open={!!chooser} onOpenChange={close}>
          <DrawerContent
            finalFocus={restoreFocus}
            onKeyDown={keyDown}
            className="pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="overflow-y-auto p-4">
              <DrawerTitle>Choose a port</DrawerTitle>
              <DrawerDescription>Several ports are under your finger.</DrawerDescription>
              {chooser && portRows(chooser.candidates, true)}
              <Button
                className="mt-2 min-h-12 w-full"
                variant="outline"
                onClick={controller.dismissPortChooser}
              >
                Cancel
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={!!chooser} onOpenChange={close}>
          <PopoverContent
            finalFocus={restoreFocus}
            onKeyDown={keyDown}
            side="top"
            sideOffset={24}
            anchor={
              chooser
                ? {
                    getBoundingClientRect: () =>
                      new DOMRect(chooser.point.x, chooser.point.y, 0, 0),
                  }
                : undefined
            }
            className="max-h-[min(28rem,80dvh)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
          >
            <PopoverTitle>Choose a port</PopoverTitle>
            <PopoverDescription>Several ports are under the pointer.</PopoverDescription>
            {chooser && portRows(chooser.candidates, true)}
            <Button variant="outline" className="min-h-12" onClick={controller.dismissPortChooser}>
              Cancel
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
