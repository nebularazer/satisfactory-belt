import { Trash2Icon } from "lucide-react";
import { memo, useCallback, useId, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";

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
import { inspectorSummary, inspectorTarget } from "@/lib/inspector";

export const Inspector = memo(function Inspector({
  editor,
  focusCanvas,
}: {
  editor: ReturnType<typeof createFactoryEditor>;
  focusCanvas: () => void;
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
  const handleDelete = useCallback(() => {
    editor.deleteSelection();
    focusCanvas();
  }, [editor, focusCanvas]);
  const summary = inspectorSummary(editor, target);
  if (!summary) return null;

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape bubbles from inspector controls; preserve the complementary landmark.
    <aside
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="pointer-events-auto sm:fixed sm:top-[max(1rem,env(safe-area-inset-top))] sm:right-[max(1rem,env(safe-area-inset-right))] sm:w-80"
      onKeyDown={handleKeyDown}
    >
      <Card className="max-h-[60dvh] gap-3 overflow-y-auto shadow-sm sm:max-h-[calc(100dvh-2rem)]">
        <CardHeader className="break-words">
          <CardTitle>
            <h2 id={titleId}>{summary.title}</h2>
          </CardTitle>
          <CardDescription id={descriptionId}>{summary.subtitle}</CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter>
          <Button
            variant="destructive"
            className="min-h-11 w-full sm:min-h-8"
            aria-label={summary.deleteLabel}
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
