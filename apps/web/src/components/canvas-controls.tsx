import { Minus, Plus, Redo2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type CanvasControlsProps = {
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onResetView: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
};

export function CanvasControls({
  canRedo,
  canUndo,
  onRedo,
  onResetView,
  onUndo,
  onZoomIn,
  onZoomOut,
  zoom,
}: CanvasControlsProps) {
  return (
    <div
      aria-label="Canvas controls"
      className="flex items-center rounded-xl border border-border bg-card p-1 shadow-md"
      role="toolbar"
    >
      <Button
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
        size="icon-lg"
        title="Undo (Ctrl/Cmd+Z)"
        variant="ghost"
      >
        <Undo2 aria-hidden="true" />
      </Button>
      <Button
        aria-label="Redo"
        disabled={!canRedo}
        onClick={onRedo}
        size="icon-lg"
        title="Redo (Ctrl/Cmd+Shift+Z)"
        variant="ghost"
      >
        <Redo2 aria-hidden="true" />
      </Button>
      <div aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <Button
        aria-label="Zoom out"
        onClick={onZoomOut}
        size="icon-lg"
        title="Zoom out (-)"
        variant="ghost"
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        aria-label={`Reset zoom, currently ${Math.round(zoom * 100)} percent`}
        onClick={onResetView}
        className="min-w-14 tabular-nums"
        size="lg"
        title="Reset view (0)"
        variant="ghost"
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        aria-label="Zoom in"
        onClick={onZoomIn}
        size="icon-lg"
        title="Zoom in (+)"
        variant="ghost"
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
