import { Trash2Icon } from "lucide-react";
import { memo, useCallback, useId, useSyncExternalStore } from "react";
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
  const titleId = useId();
  const descriptionId = useId();
  const getTarget = useCallback(() => inspectorTarget(editor.controller.getSnapshot()), [editor]);
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

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape bubbles from inspector controls; preserve the complementary landmark.
    <aside
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="pointer-events-auto sm:fixed sm:top-[max(1rem,env(safe-area-inset-top))] sm:right-[max(1rem,env(safe-area-inset-right))] sm:w-88"
      onKeyDown={handleKeyDown}
    >
      <Card className="max-h-[60dvh] gap-3 overflow-hidden shadow-sm sm:max-h-[calc(100dvh-2rem)]">
        <CardHeader className="shrink-0 break-words">
          <CardTitle>
            <h2 id={titleId}>{summary.title}</h2>
          </CardTitle>
          <CardDescription id={descriptionId}>{summary.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto overscroll-contain">
          {node && <InspectorBody key={node.id} node={node} editor={editor} assets={assets} />}
          {link && <InspectorLink key={link.id} link={link} editor={editor} assets={assets} />}
        </CardContent>
        <CardFooter className="shrink-0">
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
        </CardFooter>
      </Card>
    </aside>
  );
});
