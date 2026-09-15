/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- This bounded chooser renders only overlapping ports; callbacks capture its current port state. */
import { portId, samePort } from "@satisfactory-belt/canvas-core";
import type { CanvasController, PortReference } from "@satisfactory-belt/canvas-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverDescription } from "@/components/ui/popover";
import type { GameAssets } from "@/lib/game-assets";

const restoreFocus = () => document.querySelector("canvas");
export function PortChooser({
  controller,
  getDisplay,
  assets,
}: {
  controller: CanvasController;
  getDisplay: (id: string) => NodeDisplay | undefined;
  assets: GameAssets;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getPortSnapshot);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [focusedPort, setFocusedPort] = useState(0);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  function describe(ref: PortReference | null) {
    if (!ref) return null;
    const node = getDisplay(ref.nodeId);
    const port = node?.ports.find((entry) => entry.key === ref.portKey);
    return node && port ? { node, port } : null;
  }
  function label(ref: PortReference | null) {
    const data = describe(ref);
    return data
      ? `${data.port.itemId === null ? `${data.node.layout === "machine" ? "" : "Any solid material · "}${data.port.name}` : `${data.port.name} · ${data.port.direction}`} · ${data.node.title}${data.node.layout === "machine" ? ` · ${data.node.subtitle}` : ""}`
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
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      controller.command("escape");
      document.querySelector("canvas")?.focus();
    }
  }
  function portRows(candidates: readonly PortReference[]) {
    return (
      <fieldset className="flex flex-col gap-1" aria-label="Ports under pointer">
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
              <span className="block">{label(ref)}</span>
              <span className="block text-xs text-muted-foreground">
                {describe(ref)?.port.transport}
              </span>
            </span>
          </Button>
        ))}
      </fieldset>
    );
  }
  const chooser = state.chooser;
  const close = (open: boolean) => {
    if (!open) controller.dismissPortChooser();
  };
  return (
    <>
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
              {chooser && portRows(chooser.candidates)}
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
            {chooser && portRows(chooser.candidates)}
            <Button variant="outline" className="min-h-12" onClick={controller.dismissPortChooser}>
              Cancel
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
