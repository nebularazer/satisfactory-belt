import { FolderOpen, Network, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

type CanvasEmptyStateProps = {
  onAddNode: () => void;
  onImport: () => void;
  onOpenSavedPlans: () => void;
};

export function CanvasEmptyState({
  onAddNode,
  onImport,
  onOpenSavedPlans,
}: CanvasEmptyStateProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 w-72 -translate-x-1/2 -translate-y-1/2 text-center">
      <div className="mb-5 flex items-center justify-center gap-2 text-primary">
        <Network aria-hidden="true" className="size-7" strokeWidth={2.25} />
        <span className="font-heading text-xl font-semibold tracking-tight">
          Satisfactory Belt
        </span>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        Your plans are saved in this browser.
        <br />
        Browser storage can be cleared unexpectedly.
        <br />
        Export important plans regularly.
      </p>
      <div className="pointer-events-auto mx-auto grid w-56 gap-1">
        <Button
          className="justify-start text-muted-foreground"
          onClick={onAddNode}
          variant="ghost"
        >
          <Plus aria-hidden="true" />
          Add your first node
          <kbd className="ml-auto text-[0.625rem]">N</kbd>
        </Button>
        <Button
          className="justify-start text-muted-foreground"
          onClick={onOpenSavedPlans}
          variant="ghost"
        >
          <FolderOpen aria-hidden="true" />
          Open saved plan
        </Button>
        <Button
          className="justify-start text-muted-foreground"
          onClick={onImport}
          variant="ghost"
        >
          <Upload aria-hidden="true" />
          Import JSON
        </Button>
      </div>
    </div>
  );
}
