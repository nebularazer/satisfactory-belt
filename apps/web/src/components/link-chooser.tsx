/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Chooser callbacks capture the current hit candidate. */
import type { PortReference } from "@satisfactory-belt/canvas-core";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
const restoreFocus = () => document.querySelector("canvas");
export function LinkChooser({
  editor,
  assets,
}: {
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const { controller, getDisplay } = editor;
  const chooser = useSyncExternalStore(
    controller.subscribe,
    () => controller.getLinkSnapshot().chooser,
  );
  function label(ref: PortReference) {
    const node = getDisplay(ref.nodeId),
      port = node?.ports.find((p) => p.key === ref.portKey);
    return `${node?.title ?? "Machine"} · ${port?.name ?? "Port"}`;
  }
  return (
    <Drawer
      open={!!chooser}
      onOpenChange={(open) => {
        if (!open) controller.dismissLinkChooser();
      }}
    >
      <DrawerContent
        finalFocus={restoreFocus}
        className="pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="overflow-y-auto p-4">
          <DrawerTitle>Choose a link</DrawerTitle>
          <DrawerDescription>Several lines are under the pointer.</DrawerDescription>
          {chooser?.candidates.map((hit) => {
            const link = editor.getLink(hit.id);
            if (!link) return null;
            const materials =
              [...editor.getMaterials(link.output)]
                .map((id) => assets.catalog.items[id]?.name ?? id)
                .join(", ") || "Unassigned material";
            return (
              <Button
                key={`${hit.id}:${hit.segment}`}
                variant="ghost"
                className="h-auto min-h-12 w-full justify-start whitespace-normal text-left"
                onClick={() => controller.chooseLinkHit(hit)}
              >
                {materials} · {label(link.output)} → {label(link.input)} · Segment {hit.segment + 1}
              </Button>
            );
          })}
          <Button variant="outline" className="min-h-12" onClick={controller.dismissLinkChooser}>
            Cancel
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
