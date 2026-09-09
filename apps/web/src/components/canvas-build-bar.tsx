import {
  ChevronDown,
  Combine,
  GitFork,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { CanvasEditorMode } from "@/canvas/editor-mode";

type CanvasBuildBarProps = Readonly<{
  mode: CanvasEditorMode;
  detailedAvailable?: boolean;
  basicAvailable?: boolean;
  onAddMerger: () => void;
  onAddNode: () => void;
  onAddSplitter: () => void;
  onCancelPlacement: () => void;
  onModeChange: (mode: CanvasEditorMode) => void;
  placementLabel?: string;
}>;

export function CanvasBuildBar({
  mode,
  detailedAvailable = true,
  basicAvailable = true,
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
      className="flex min-h-11 items-center justify-between sm:justify-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur-sm"
      role="toolbar"
    >
      {placementLabel ? (
        <>
          <div className="min-w-0 px-2 text-xs text-muted-foreground">
            Tap canvas to place <strong>{placementLabel}</strong>
          </div>
          <Button
            aria-label="Cancel node placement"
            className="size-11 shrink-0 sm:size-9"
            onClick={onCancelPlacement}
            size="icon-lg"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </>
      ) : (
        <>
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={`Plan mode: ${mode === "basic" ? "Basic" : "Detailed"}`}
                    className="h-11 px-2"
                    variant="secondary"
                  />
                }
              >
                {mode === "basic" ? "Basic" : "Detailed"}
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={!basicAvailable}
                  onClick={() => onModeChange("basic")}
                >
                  Basic
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => onModeChange("detailed")}
                >
                  {detailedAvailable ? "Detailed" : "Create Detailed"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div
            className="hidden items-center gap-0.5 sm:flex"
            role="group"
            aria-label="Editor mode"
          >
            {(["basic", "detailed"] as const).map((option) => (
              <Button
                aria-label={
                  option === "detailed" && !detailedAvailable
                    ? "Create Detailed plan"
                    : `${option === "basic" ? "Basic" : "Detailed"} editor`
                }
                disabled={option === "basic" && !basicAvailable}
                aria-pressed={mode === option}
                className="h-9 px-1.5 sm:px-2.5"
                key={option}
                onClick={() => onModeChange(option)}
                title={
                  option === mode
                    ? `${option === "basic" ? "Basic" : "Detailed"} plan`
                    : option === "detailed"
                      ? detailedAvailable
                        ? "Open the Detailed plan"
                        : "Create and arrange individual machines and balancers"
                      : "Open the linked Basic plan"
                }
                variant={mode === option ? "secondary" : "ghost"}
              >
                {option === "basic"
                  ? "Basic"
                  : detailedAvailable
                    ? "Detailed"
                    : "Create Detailed"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <div
              aria-hidden="true"
              className="mx-0.5 hidden h-6 w-px bg-border sm:block"
            />
            <Button
              aria-label="Add node"
              className="h-11 px-2 sm:h-9 sm:px-3"
              onClick={onAddNode}
              variant="ghost"
            >
              <Plus aria-hidden="true" />
              <span className="hidden min-[360px]:inline">Add node</span>
              <span className="min-[360px]:hidden">Add</span>
            </Button>
            <Button
              aria-label="Splitter"
              className="hidden h-9 px-3 sm:inline-flex"
              onClick={onAddSplitter}
              variant="ghost"
            >
              <GitFork aria-hidden="true" />
              <span className="hidden sm:inline">Splitter</span>
            </Button>
            <Button
              aria-label="Merger"
              className="hidden h-9 px-3 sm:inline-flex"
              onClick={onAddMerger}
              variant="ghost"
            >
              <Combine aria-hidden="true" />
              <span className="hidden sm:inline">Merger</span>
            </Button>
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="More build tools"
                      className="size-11"
                      size="icon-lg"
                      variant="ghost"
                    />
                  }
                >
                  <MoreHorizontal aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem
                    className="min-h-11"
                    onClick={onAddSplitter}
                  >
                    <GitFork aria-hidden="true" /> Splitter
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11" onClick={onAddMerger}>
                    <Combine aria-hidden="true" /> Merger
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
