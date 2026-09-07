import { Combine, GitFork, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CanvasEditorMode } from "@/canvas/editor-mode";

type CanvasBuildBarProps = Readonly<{
  mode: CanvasEditorMode;
  onAddMerger: () => void;
  onAddNode: () => void;
  onAddSplitter: () => void;
  onCancelPlacement: () => void;
  onModeChange: (mode: CanvasEditorMode) => void;
  placementLabel?: string;
}>;

export function CanvasBuildBar({
  mode,
  onAddMerger,
  onAddNode,
  onAddSplitter,
  onCancelPlacement,
  onModeChange,
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
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label="Editor mode"
          >
            {(["basic", "detailed"] as const).map((option) => (
              <Button
                aria-label={`${option === "basic" ? "Basic" : "Detailed"} editor`}
                aria-pressed={mode === option}
                className="h-9 px-2.5"
                key={option}
                onClick={() => onModeChange(option)}
                variant={mode === option ? "secondary" : "ghost"}
              >
                {option === "basic" ? "Basic" : "Detailed"}
              </Button>
            ))}
          </div>
          <div aria-hidden="true" className="mx-0.5 h-6 w-px bg-border" />
          <Button className="h-9 px-3" onClick={onAddNode} variant="ghost">
            <Plus aria-hidden="true" />
            <span className="hidden min-[360px]:inline">Add node</span>
            <span className="min-[360px]:hidden">Add</span>
          </Button>
          <Button className="h-9 px-3" onClick={onAddSplitter} variant="ghost">
            <GitFork aria-hidden="true" />
            <span className="hidden sm:inline">Splitter</span>
          </Button>
          <Button className="h-9 px-3" onClick={onAddMerger} variant="ghost">
            <Combine aria-hidden="true" />
            <span className="hidden sm:inline">Merger</span>
          </Button>
        </>
      )}
    </div>
  );
}
