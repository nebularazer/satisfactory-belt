import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, Database, Save, Trash2 } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SavedPlansDialogProps = {
  activeSave: SavedCanvasDocument | null;
  currentDocument: CanvasDocument;
  onDelete: (save: SavedCanvasDocument) => void;
  onLoad: (save: SavedCanvasDocument) => void;
  onOpenChange: (open: boolean) => void;
  onSaved: (save: SavedCanvasDocument) => void;
  open: boolean;
  storage: CanvasDocumentStorage;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SavedPlansDialog({
  activeSave,
  currentDocument,
  onDelete,
  onLoad,
  onOpenChange,
  onSaved,
  open,
  storage,
}: SavedPlansDialogProps) {
  const [deleting, setDeleting] = useState<SavedCanvasDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const existingName = name.trim().toLocaleLowerCase();
  const existing = existingName
    ? saves.find((save) => save.name.toLocaleLowerCase() === existingName)
    : undefined;

  const saveAs = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName || saving) return;

    setSaving(true);
    try {
      const saved = await storage.saveNamed({
        document: currentDocument,
        id: existing?.id,
        name: normalizedName,
      });
      onSaved(saved);
      setName("");
      await refresh();
      toast.success(existing ? `Updated “${saved.name}”.` : `Saved “${saved.name}”.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The plan could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateCurrent = async () => {
    if (!activeSave || saving) return;
    setSaving(true);
    try {
      const saved = await storage.saveNamed({
        document: currentDocument,
        id: activeSave.id,
      });
      onSaved(saved);
      await refresh();
      toast.success(`Updated “${saved.name}”.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The plan could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  };

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
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
          overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        >
          <DialogHeader>
            <DialogTitle>Saved plans</DialogTitle>
            <DialogDescription>
              Named snapshots stay in this browser. Most recently updated plans
              appear first.
            </DialogDescription>
          </DialogHeader>

          <section
            aria-label="Current saved plan"
            className="flex items-center gap-3 rounded-lg border bg-muted/45 p-3"
          >
            {activeSave ? (
              <>
                <CheckCircle2
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
                    Current saved plan
                  </div>
                  <div className="truncate font-medium">{activeSave.name}</div>
                  <div className="text-[0.625rem] text-muted-foreground">
                    Update overwrites this saved snapshot.
                  </div>
                </div>
                <Button
                  disabled={saving}
                  onClick={() => void updateCurrent()}
                  size="sm"
                  type="button"
                >
                  <Save aria-hidden="true" />
                  Update
                  <span className="hidden text-[0.625rem] opacity-70 sm:inline">
                    Ctrl/Cmd+S
                  </span>
                </Button>
              </>
            ) : (
              <>
                <Database
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <div>
                  <div className="font-medium">Unsaved plan</div>
                  <div className="text-[0.625rem] text-muted-foreground">
                    Create a named save below, or load an existing one.
                  </div>
                </div>
              </>
            )}
          </section>

          <form className="space-y-1.5" onSubmit={(event) => void saveAs(event)}>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="saved-plan-name">
                Plan name
              </label>
              <Input
                autoComplete="off"
                id="saved-plan-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name this plan"
                value={name}
              />
              <Button
                disabled={name.trim().length === 0 || saving}
                type="submit"
                variant={existing ? "destructive" : "default"}
              >
                {existing ? "Overwrite" : "Save as new"}
              </Button>
            </div>
            <p className="min-h-4 text-[0.625rem] text-muted-foreground">
              {existing
                ? `This replaces the existing “${existing.name}” snapshot.`
                : "A new name creates a separate saved snapshot."}
            </p>
          </form>

          <ScrollArea className="h-72 min-h-72 max-h-72 rounded-lg border">
            {loading ? (
              <div className="grid h-72 place-items-center text-muted-foreground">
                Loading saved plans…
              </div>
            ) : saves.length === 0 ? (
              <div className="grid h-72 place-items-center gap-1 text-center text-muted-foreground">
                <Database aria-hidden="true" className="size-5" />
                <span>No named plans yet</span>
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
                        variant="outline"
                      >
                        {current ? "Loaded" : "Load"}
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
        <AlertDialogContent overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none">
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
