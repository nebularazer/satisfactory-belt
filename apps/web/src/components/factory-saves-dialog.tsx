import { findFactoryByName } from "@satisfactory-belt/factory-saves";
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
  kind,
  onOpenChange,
  onLoad,
  onSaveAs,
  onOverwrite,
  onDelete,
  finalFocus,
}: {
  store: Pick<FactoryStore, "list">;
  activeSave: FactorySave | null;
  kind: "open" | "save";
  onOpenChange: (open: boolean) => void;
  onLoad: (id: string) => Promise<void>;
  onSaveAs: (name: string) => Promise<void>;
  onOverwrite: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  finalFocus: () => HTMLElement | null;
}) {
  const [mode, setMode] = useState<"open" | "save" | "delete" | "overwrite">(kind);
  const [saves, setSaves] = useState<FactorySave[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    kind === "open" ? (activeSave?.id ?? null) : null,
  );
  const [name, setName] = useState(activeSave?.name ?? "Factory 1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelConfirm = useRef<HTMLButtonElement>(null);
  const selected =
    kind === "save"
      ? findFactoryByName(saves, name)
      : saves.find((saved) => saved.id === selectedId);
  const overwriteId = kind === "save" ? selected?.id : undefined;

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
    if (mode === "delete" || mode === "overwrite") cancelConfirm.current?.focus();
  }, [mode]);
  const initialFocus = useCallback(() => (kind === "save" ? nameInput.current : null), [kind]);
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
      setError(reason instanceof Error ? reason.message : "The operation failed. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const openDelete = useCallback(() => {
    setError(null);
    setMode("delete");
  }, []);
  const cancel = useCallback(() => {
    setError(null);
    setMode(kind);
  }, [kind]);
  const changeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    [],
  );
  const selectSave = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const id = event.target.value;
      if (kind === "save") {
        const saved = saves.find((entry) => entry.id === id);
        if (saved) setName(saved.name);
      } else setSelectedId(id);
    },
    [kind, saves],
  );
  const load = useCallback(() => {
    if (selectedId)
      void run(async () => {
        await onLoad(selectedId);
        close();
      });
  }, [selectedId, run, onLoad, close]);
  const save = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy || loading || !name.trim()) return;
      void run(async () => {
        const current = await store.list();
        setSaves(current);
        if (findFactoryByName(current, name)) {
          setMode("overwrite");
          return;
        }
        await onSaveAs(name.trim());
        close();
      });
    },
    [busy, loading, name, run, store, onSaveAs, close],
  );
  const overwrite = useCallback(() => {
    if (overwriteId)
      void run(async () => {
        await onOverwrite(overwriteId);
        close();
      });
  }, [overwriteId, run, onOverwrite, close]);
  const remove = useCallback(() => {
    if (!selectedId) return;
    void run(async () => {
      await onDelete(selectedId);
      setSaves((previous) => previous.filter((entry) => entry.id !== selectedId));
      setSelectedId(null);
      setMode("open");
    });
  }, [selectedId, run, onDelete]);

  return (
    <Dialog open onOpenChange={changeOpen}>
      <DialogContent
        initialFocus={initialFocus}
        finalFocus={finalFocus}
        showCloseButton={!busy}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "save"
              ? "Save as…"
              : mode === "overwrite"
                ? "Overwrite factory?"
                : mode === "delete"
                  ? "Delete factory?"
                  : "Open factory"}
          </DialogTitle>
          <DialogDescription>
            {mode === "save"
              ? "Enter a new name or choose an existing factory to overwrite."
              : mode === "overwrite"
                ? `Replace “${selected?.name ?? "this factory"}” with the current canvas? This cannot be undone.`
                : mode === "delete"
                  ? `Delete “${selected?.name ?? "this factory"}” from your saved factories? This cannot be undone.`
                  : "Saved factories update automatically in this browser."}
          </DialogDescription>
        </DialogHeader>
        {(mode === "open" || mode === "save") && (
          <form onSubmit={mode === "save" ? save : undefined} className="space-y-4">
            {mode === "save" && (
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
            )}
            <div
              className="max-h-[40dvh] space-y-2 overflow-y-auto pr-3 [scrollbar-gutter:stable]"
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
                saves.map((saved) => (
                  <label
                    key={saved.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-muted/50"
                  >
                    <input
                      type="radio"
                      name="factory-save"
                      value={saved.id}
                      checked={selected?.id === saved.id}
                      onChange={selectSave}
                      disabled={busy}
                      className="shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{saved.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {saved.updatedAt
                          ? new Date(saved.updatedAt).toLocaleString()
                          : "Previous autosave"}
                      </span>
                    </span>
                    {saved.id === activeSave?.id && (
                      <span className="shrink-0 text-xs text-muted-foreground">Current</span>
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
            <DialogFooter className="flex-row justify-end">
              {mode === "save" ? (
                <>
                  <Button type="button" variant="outline" disabled={busy} onClick={close}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy || loading || !name.trim()}>
                    {busy ? "Saving…" : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy || !selected}
                    onClick={openDelete}
                  >
                    Delete…
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || !selected || selectedId === activeSave?.id}
                    onClick={load}
                  >
                    {busy ? "Opening…" : "Open"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        )}
        {(mode === "delete" || mode === "overwrite") && (
          <>
            {mode === "delete" && selectedId === activeSave?.id && (
              <p className="text-sm text-muted-foreground">
                The current canvas will stay open as an unsaved factory.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="flex-row justify-end">
              <Button ref={cancelConfirm} variant="outline" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={mode === "delete" ? remove : overwrite}
              >
                {busy
                  ? mode === "delete"
                    ? "Deleting…"
                    : "Saving…"
                  : mode === "delete"
                    ? "Delete factory"
                    : "Overwrite factory"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
