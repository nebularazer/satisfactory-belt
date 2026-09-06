import { Combine, GitFork, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type CanvasBuildBarProps = Readonly<{
  onAddMerger: () => void;
  onAddNode: () => void;
  onAddSplitter: () => void;
  onCancelPlacement: () => void;
  placementLabel?: string;
}>;

export function CanvasBuildBar({
  onAddMerger,
  onAddNode,
  onAddSplitter,
  onCancelPlacement,
  placementLabel,
}: CanvasBuildBarProps) {
  return (
    <div
      aria-label="Build tools"
      className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur-sm"
      role="toolbar"
    >
      {placementLabel ? (
        <>
          <div className="px-2 text-xs text-muted-foreground">
            Tap canvas to place <strong>{placementLabel}</strong>
          </div>
          <Button
            aria-label="Cancel node placement"
            className="size-9"
            onClick={onCancelPlacement}
            size="icon-lg"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </>
      ) : (
        <>
          <Button className="h-9 px-3" onClick={onAddNode} variant="ghost">
            <Plus aria-hidden="true" />
            Add node
          </Button>
          <Button className="h-9 px-3" onClick={onAddSplitter} variant="ghost">
            <GitFork aria-hidden="true" />
            Splitter
          </Button>
          <Button className="h-9 px-3" onClick={onAddMerger} variant="ghost">
            <Combine aria-hidden="true" />
            Merger
          </Button>
        </>
      )}
    </div>
  );
}
