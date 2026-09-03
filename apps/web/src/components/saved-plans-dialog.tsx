import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock3, Database, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  CanvasDocumentStorage,
  SavedCanvasDocument,
} from "@/canvas/document-storage";
import type { CanvasDocument } from "@/canvas/editor";
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
import { Input } from "@/components/ui/input";

type SavedPlansDialogProps = {
  currentDocument: CanvasDocument;
  onLoad: (document: CanvasDocument) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  storage: CanvasDocumentStorage;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SavedPlansDialog({
  currentDocument,
  onLoad,
  onOpenChange,
  open,
  storage,
}: SavedPlansDialogProps) {
  const [deleting, setDeleting] = useState<SavedCanvasDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
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

  const saveCurrent = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const existing = saves.find(
      (save) =>
        save.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
    );

    try {
      await storage.saveNamed(normalizedName, currentDocument, existing?.id);
      setName("");
      await refresh();
      toast.success(existing ? "Saved plan updated." : "Plan saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The plan could not be saved.",
      );
    }
  };

  const deleteSave = async () => {
    if (!deleting) return;
    try {
      await storage.deleteNamed(deleting.id);
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved plans</DialogTitle>
            <DialogDescription>
              Store named snapshots in this browser. Saving an existing name
              updates it.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex gap-2"
            onSubmit={(event) => void saveCurrent(event)}
          >
            <label className="sr-only" htmlFor="saved-plan-name">
              Plan name
            </label>
            <Input
              autoComplete="off"
              id="saved-plan-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Plan name"
              value={name}
            />
            <Button disabled={name.trim().length === 0} type="submit">
              Save current
            </Button>
          </form>

          <div className="max-h-72 min-h-24 overflow-y-auto rounded-lg border border-border">
            {loading ? (
              <div className="grid h-24 place-items-center text-muted-foreground">
                Loading saved plans…
              </div>
            ) : saves.length === 0 ? (
              <div className="grid h-24 place-items-center gap-1 text-center text-muted-foreground">
                <Database aria-hidden="true" className="size-5" />
                <span>No named plans yet</span>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {saves.map((save) => (
                  <li className="flex items-center gap-3 p-2" key={save.id}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{save.name}</div>
                      <div className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
                        <Clock3 aria-hidden="true" className="size-3" />
                        {dateFormatter.format(new Date(save.updatedAt))}
                        <span aria-hidden="true">·</span>
                        {save.document.nodes.length}{" "}
                        {save.document.nodes.length === 1 ? "node" : "nodes"}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        onLoad(save.document);
                        onOpenChange(false);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Load
                    </Button>
                    <Button
                      aria-label={`Delete ${save.name}`}
                      onClick={() => setDeleting(save)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              This removes the named snapshot from this browser. It does not
              change the active canvas.
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
