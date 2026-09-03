import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type CanvasHintProps = {
  onDismiss: () => void;
};

export function CanvasHint({ onDismiss }: CanvasHintProps) {
  return (
    <div className="flex max-w-[calc(100vw-5rem)] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md">
      <span className="hidden sm:inline">
        Press N or right-click the canvas to add your first node
      </span>
      <span className="sm:hidden">Tap the menu to add your first node</span>
      <Button
        aria-label="Dismiss canvas hint"
        className="-mr-1 size-6"
        onClick={onDismiss}
        size="icon-sm"
        variant="ghost"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
