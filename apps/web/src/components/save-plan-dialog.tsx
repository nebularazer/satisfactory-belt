import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, Database } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SavePlanDialogProps = {
  activeSave: SavedCanvasDocument | null;
  currentDocument: CanvasDocument;
  onOpenChange: (open: boolean) => void;
  onSaved: (save: SavedCanvasDocument) => void;
  open: boolean;
  storage: CanvasDocumentStorage;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SavePlanDialog({
  activeSave,
  currentDocument,
  onOpenChange,
  onSaved,
  open,
  storage,
}: SavePlanDialogProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [overwriteTarget, setOverwriteTarget] =
    useState<SavedCanvasDocument | null>(null);
  const [saves, setSaves] = useState<readonly SavedCanvasDocument[]>([]);
  const [saving, setSaving] = useState(false);

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

  const normalizedName = name.trim();
  const normalizedSearch = normalizedName.toLocaleLowerCase();
  const existing = normalizedSearch
    ? saves.find(
        (save) => save.name.toLocaleLowerCase() === normalizedSearch,
      )
    : undefined;
  const filteredSaves = normalizedSearch
    ? saves.filter((save) =>
        save.name.toLocaleLowerCase().includes(normalizedSearch),
      )
    : saves;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
      setOverwriteTarget(null);
    }
    onOpenChange(nextOpen);
  };

  const persist = async (target?: SavedCanvasDocument) => {
    const saveName = target?.name ?? normalizedName;
    if (!saveName || saving) return;

    setSaving(true);
    try {
      const saved = await storage.saveNamed({
        document: currentDocument,
        id: target?.id,
        name: saveName,
      });
      onSaved(saved);
      setOverwriteTarget(null);
      handleOpenChange(false);
      toast.success(
        target ? `Overwrote “${saved.name}”.` : `Saved “${saved.name}”.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The plan could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedName || saving) return;
    if (existing) {
      setOverwriteTarget(existing);
      return;
    }
    void persist();
  };

  return (
    <>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save plan as</DialogTitle>
            <DialogDescription>
              Use a new name, or select an existing plan to replace it.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <label className="font-medium" htmlFor="save-plan-name">
                Plan name
              </label>
              <Input
                autoComplete="off"
                autoFocus
                id="save-plan-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="My factory plan"
                value={name}
              />
              <p className="min-h-4 text-[0.625rem] text-muted-foreground">
                {existing
                  ? `“${existing.name}” already exists and will require confirmation.`
                  : "A new name creates a separate saved plan."}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
                Existing plans
              </div>
              <ScrollArea className="h-48 min-h-48 max-h-48 rounded-lg border">
                {loading ? (
                  <div className="grid h-48 place-items-center text-muted-foreground">
                    Loading saved plans…
                  </div>
                ) : saves.length === 0 ? (
                  <div className="grid h-48 place-items-center gap-1 text-center text-muted-foreground">
                    <Database aria-hidden="true" className="size-5" />
                    <span>No existing plans</span>
                  </div>
                ) : filteredSaves.length === 0 ? (
                  <div className="grid h-48 place-items-center text-center text-muted-foreground">
                    No existing plan matches this name.
                  </div>
                ) : (
                  <ul className="divide-y divide-border pr-2">
                    {filteredSaves.map((save) => {
                      const selected = save.id === existing?.id;
                      const current = save.id === activeSave?.id;
                      return (
                        <li key={save.id}>
                          <button
                            aria-pressed={selected}
                            className={cn(
                              "flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                              selected && "bg-destructive/5",
                            )}
                            onClick={() => setName(save.name)}
                            type="button"
                          >
                            <CheckCircle2
                              aria-hidden="true"
                              className={cn(
                                "size-4 shrink-0",
                                selected ? "text-destructive" : "invisible",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium">
                                  {save.name}
                                </span>
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
                                {save.document.nodes.length === 1
                                  ? "node"
                                  : "nodes"}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={!normalizedName || saving}
                type="submit"
                variant={existing ? "destructive" : "default"}
              >
                {existing ? `Overwrite “${existing.name}”` : "Save as new"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(isOpen) => {
          if (!isOpen) setOverwriteTarget(null);
        }}
        open={overwriteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Overwrite “{overwriteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its saved contents will be replaced by the current canvas. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                if (overwriteTarget) void persist(overwriteTarget);
              }}
              variant="destructive"
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
