import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Database,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type {
  CanvasDocumentStorage,
  SavedCanvasDocument,
} from "@/canvas/document-storage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ManagePlansDialogProps = {
  activeSave: SavedCanvasDocument | null;
  onDelete: (save: SavedCanvasDocument) => void;
  onLoad: (save: SavedCanvasDocument) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  storage: CanvasDocumentStorage;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ManagePlansDialog({
  activeSave,
  onDelete,
  onLoad,
  onOpenChange,
  open,
  storage,
}: ManagePlansDialogProps) {
  const [deleting, setDeleting] = useState<SavedCanvasDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saves, setSaves] = useState<readonly SavedCanvasDocument[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSaves(await storage.listNamed());
    } catch {
      toast.error("Saved plans could not be read from this browser.");
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const deleteSave = async () => {
    if (!deleting) return;
    try {
      await storage.deleteNamed(deleting.id);
      onDelete(deleting);
      setDeleting(null);
      await refresh();
      toast.success("Saved plan deleted.");
    } catch {
      toast.error("The saved plan could not be deleted.");
    }
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage plans</DialogTitle>
            <DialogDescription>
              Open or delete browser-local plans, sorted by most recent update.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-72 min-h-72 max-h-72 rounded-lg border">
            {loading ? (
              <div className="grid h-72 place-items-center text-muted-foreground">
                Loading saved plans…
              </div>
            ) : saves.length === 0 ? (
              <div className="grid h-72 place-items-center gap-1 text-center text-muted-foreground">
                <Database aria-hidden="true" className="size-5" />
                <span>No saved plans yet</span>
              </div>
            ) : (
              <ul className="divide-y divide-border pr-2">
                {saves.map((save) => {
                  const current = save.id === activeSave?.id;
                  return (
                    <li
                      className={cn(
                        "flex min-h-14 items-center gap-2 p-2",
                        current && "bg-primary/5",
                      )}
                      key={save.id}
                    >
                      <CheckCircle2
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          current ? "text-primary" : "invisible",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{save.name}</span>
                          {current && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.5625rem] font-medium text-primary">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
                          <Clock3 aria-hidden="true" className="size-3" />
                          {dateFormatter.format(new Date(save.updatedAt))}
                          <span aria-hidden="true">·</span>
                          {save.document.nodes.length}{" "}
                          {save.document.nodes.length === 1 ? "node" : "nodes"}
                        </div>
                      </div>
                      <Button
                        disabled={current}
                        onClick={() => {
                          onLoad(save);
                          onOpenChange(false);
                        }}
                        size="sm"
                        variant={current ? "ghost" : "default"}
                      >
                        {current ? "Current" : "Open"}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              aria-label={`Manage ${save.name}`}
                              size="icon-sm"
                              variant="ghost"
                            />
                          }
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4}>
                          <DropdownMenuItem
                            onClick={() => setDeleting(save)}
                            variant="destructive"
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null);
        }}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved plan from this browser. It does not change
              the active canvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteSave()}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
