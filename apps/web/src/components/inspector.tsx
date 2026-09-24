import { isFlowGroup } from "@satisfactory-belt/factory-core";
import { Trash2Icon } from "lucide-react";
import { memo, useCallback, useId, useSyncExternalStore, useEffect, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { InspectorBody } from "@/components/inspector-body";
import { InspectorLink } from "@/components/inspector-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
import { inspectorSummary, inspectorTarget } from "@/lib/inspector";

export const Inspector = memo(function Inspector({
  editor,
  focusCanvas,
  assets,
}: {
  editor: ReturnType<typeof createFactoryEditor>;
  focusCanvas: () => void;
  assets: GameAssets;
}) {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const closeDrawer = useCallback(
    (open: boolean) => {
      if (!open) {
        editor.controller.command("escape");
        focusCanvas();
      }
    },
    [editor, focusCanvas],
  );
  const titleId = useId();
  const descriptionId = useId();
  const getTarget = useCallback(() => {
    const snapshot = editor.controller.getSnapshot();
    // A touch-down may become a drag or pinch. Wait for a completed tap before
    // opening a modal sheet that would intercept the rest of the gesture.
    return narrow && snapshot.interaction !== "idle" ? null : inspectorTarget(snapshot);
  }, [editor, narrow]);
  const target = useSyncExternalStore(editor.controller.subscribe, getTarget);
  useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      editor.controller.command("escape");
      focusCanvas();
    },
    [editor, focusCanvas],
  );
  // Keep a pending field draft from blurring/committing immediately before deletion.
  const handleDeletePointerDown = useCallback((event: PointerEvent) => {
    if (event.button === 0) event.preventDefault();
  }, []);
  const handleDelete = useCallback(() => {
    editor.deleteSelection();
    focusCanvas();
  }, [editor, focusCanvas]);
  const summary = inspectorSummary(editor, target);
  const node = target?.startsWith("node:") ? editor.getNode(target.slice(5)) : undefined;
  const link = target?.startsWith("link:") ? editor.getLink(target.slice(5)) : undefined;
  if (!summary) return null;
  const subtitle =
    node && isFlowGroup(node) ? summary.subtitle?.replace(/^\d+×\s*/, "") : summary.subtitle;

  const body = (
    <>
      {node && <InspectorBody key={node.id} node={node} editor={editor} assets={assets} />}
      {link && <InspectorLink key={link.id} link={link} editor={editor} assets={assets} />}
    </>
  );
  const deleteButton = (
    <Button
      variant="destructive"
      className="min-h-11 w-full sm:min-h-8"
      aria-label={summary.deleteLabel}
      onPointerDown={handleDeletePointerDown}
      onClick={handleDelete}
    >
      <Trash2Icon />
      Delete
    </Button>
  );
  if (narrow)
    return (
      <Drawer open onOpenChange={closeDrawer} showSwipeHandle>
        <DrawerContent
          initialFocus={false}
          finalFocus={false}
          onKeyDown={handleKeyDown}
          className="max-h-[calc(100dvh-6rem)]"
        >
          <div className="shrink-0 space-y-1 p-4">
            <DrawerTitle>{summary.title}</DrawerTitle>
            {subtitle && <DrawerDescription>{subtitle}</DrawerDescription>}
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">{body}</div>
          <div className="shrink-0 border-t bg-muted/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {deleteButton}
          </div>
        </DrawerContent>
      </Drawer>
    );
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape bubbles from inspector controls; preserve the complementary landmark.
    <aside
      aria-labelledby={titleId}
      aria-describedby={subtitle ? descriptionId : undefined}
      className="pointer-events-auto sm:fixed sm:top-[max(1rem,env(safe-area-inset-top))] sm:right-[max(1rem,env(safe-area-inset-right))] sm:w-88"
      onKeyDown={handleKeyDown}
    >
      <Card className="max-h-[60dvh] gap-0 overflow-hidden shadow-sm sm:max-h-[calc(100dvh-2rem)]">
        <CardHeader className="shrink-0 break-words pb-4">
          <CardTitle>
            <h2 id={titleId}>{summary.title}</h2>
          </CardTitle>
          {subtitle && <CardDescription id={descriptionId}>{subtitle}</CardDescription>}
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto overscroll-contain pb-4">
          {body}
        </CardContent>
        <CardFooter className="shrink-0">{deleteButton}</CardFooter>
      </Card>
    </aside>
  );
});
