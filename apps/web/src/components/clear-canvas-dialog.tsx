import { useCallback, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ClearCanvasDialog({
  open,
  onOpenChange,
  onConfirm,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  finalFocus: () => HTMLElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const confirm = useCallback(() => {
    onConfirm();
    close();
  }, [onConfirm, close]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={cancel} finalFocus={finalFocus} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Clear canvas?</DialogTitle>
          <DialogDescription>
            Remove all buildings and connections to start from scratch.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancel} variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm}>
            Clear canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
