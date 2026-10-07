import type { FactorySave, FactoryStore } from "@satisfactory-belt/factory-saves";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

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

export function FactorySavesDialog({
  store,
  activeSave,
  saveAsNew,
  onOpenChange,
  onLoad,
  onSaveAsNew,
  onDelete,
  finalFocus,
}: {
  store: Pick<FactoryStore, "list">;
  activeSave: FactorySave | null;
  saveAsNew: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (id: string) => Promise<void>;
  onSaveAsNew: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  finalFocus: () => HTMLElement | null;
}) {
  const [mode, setMode] = useState<"list" | "copy" | "delete">(saveAsNew ? "copy" : "list");
  const [saves, setSaves] = useState<FactorySave[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(activeSave?.id ?? null);
  const [name, setName] = useState(activeSave ? `${activeSave.name} copy` : "Factory 1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const selected = saves.find((save) => save.id === selectedId);

  useEffect(() => {
    let active = true;
    void store.list().then(
      (saved) => {
        if (active) {
          setSaves(saved);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setError("Saved factories could not be listed. Close this dialog and try again.");
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [store]);
  useEffect(() => {
    if (mode === "copy") {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
    if (mode === "delete") cancelDelete.current?.focus();
  }, [mode]);

  const changeOpen = useCallback(
    (open: boolean) => {
      if (!busy) onOpenChange(open);
    },
    [busy, onOpenChange],
  );
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The factory could not be saved. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const openCopy = useCallback(() => {
    setError(null);
    setMode("copy");
  }, []);
  const openDelete = useCallback(() => {
    setError(null);
    setMode("delete");
  }, []);
  const cancel = useCallback(() => {
    setError(null);
    setMode("list");
  }, []);
  const changeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    [],
  );
  const selectSave = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setSelectedId(event.target.value),
    [],
  );
  const load = useCallback(() => {
    if (selectedId)
      void run(async () => {
        await onLoad(selectedId);
        close();
      });
  }, [selectedId, run, onLoad, close]);
  const copy = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!busy && name.trim())
        void run(async () => {
          await onSaveAsNew(name.trim());
          close();
        });
    },
    [busy, name, run, onSaveAsNew, close],
  );
  const remove = useCallback(() => {
    if (!selectedId) return;
    void run(async () => {
      await onDelete(selectedId);
      setSaves((previous) => previous.filter((save) => save.id !== selectedId));
      setSelectedId(null);
      setMode("list");
    });
  }, [selectedId, run, onDelete]);

  return (
    <Dialog open onOpenChange={changeOpen}>
      <DialogContent finalFocus={finalFocus} showCloseButton={!busy} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "copy"
              ? "Save as new"
              : mode === "delete"
                ? "Delete factory?"
                : "Saved factories"}
          </DialogTitle>
          <DialogDescription>
            {mode === "copy"
              ? "Save a separate copy of your current factory."
              : mode === "delete"
                ? `Delete “${selected?.name ?? "this factory"}” from your saved factories? This cannot be undone.`
                : "Saved factories update automatically in this browser."}
          </DialogDescription>
        </DialogHeader>
        {mode === "list" && (
          <>
            <div
              className="max-h-[50dvh] space-y-2 overflow-y-auto"
              aria-label="Saved factories"
              aria-busy={loading}
            >
              {loading ? (
                <output className="block py-6 text-center text-muted-foreground">
                  Loading factories…
                </output>
              ) : !saves.length ? (
                <p className="py-6 text-center text-muted-foreground">No saved factories yet.</p>
              ) : (
                saves.map((save) => (
                  <label
                    key={save.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted/50"
                  >
                    <input
                      type="radio"
                      name="factory-save"
                      value={save.id}
                      checked={selectedId === save.id}
                      onChange={selectSave}
                      disabled={busy}
                      className="shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{save.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {save.updatedAt
                          ? new Date(save.updatedAt).toLocaleString()
                          : "Previous autosave"}
                      </span>
                    </span>
                    {save.id === activeSave?.id && (
                      <span className="text-xs text-muted-foreground">Current</span>
                    )}
                  </label>
                ))
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" disabled={busy} onClick={openCopy}>
                Save as new…
              </Button>
              <div className="flex justify-end gap-2">
                <Button variant="destructive" disabled={busy || !selected} onClick={openDelete}>
                  Delete…
                </Button>
                <Button
                  disabled={busy || !selected || selectedId === activeSave?.id}
                  onClick={load}
                >
                  {busy ? "Loading…" : "Load"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
        {mode === "copy" && (
          <form onSubmit={copy} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="factory-name" className="text-sm font-medium">
                Factory name
              </label>
              <Input
                ref={nameInput}
                id="factory-name"
                value={name}
                onChange={changeName}
                disabled={busy}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Save as new"}
              </Button>
            </DialogFooter>
          </form>
        )}
        {mode === "delete" && (
          <>
            {selectedId === activeSave?.id && (
              <p className="text-sm text-muted-foreground">
                The current canvas will stay open as an unsaved factory.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button ref={cancelDelete} variant="outline" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Delete factory"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
