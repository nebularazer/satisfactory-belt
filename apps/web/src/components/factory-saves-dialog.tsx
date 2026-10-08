import { findFactoryByName } from "@satisfactory-belt/factory-saves";
import type { FactorySave, FactoryStore } from "@satisfactory-belt/factory-saves";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, FormEvent, KeyboardEvent } from "react";

import { FactorySaveRow } from "@/components/factory-save-row";
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
  initialName,
  onOpenChange,
  onLoad,
  onSaveAs,
  onOverwrite,
  onDelete,
  onRename,
  onImport,
  onExport,
  finalFocus,
}: {
  store: Pick<FactoryStore, "list">;
  activeSave: FactorySave | null;
  kind: "open" | "save" | "import";
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onLoad: (id: string) => Promise<void>;
  onSaveAs: (name: string) => Promise<void>;
  onOverwrite: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<FactorySave>;
  onImport?: (file: File) => Promise<void>;
  onExport?: (name: string) => void;
  finalFocus: () => HTMLElement | null;
}) {
  const [mode, setMode] = useState<"open" | "save" | "import" | "rename" | "delete" | "overwrite">(
    kind,
  );
  const [saves, setSaves] = useState<FactorySave[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    kind === "open" ? (activeSave?.id ?? null) : null,
  );
  const [name, setName] = useState(initialName ?? activeSave?.name ?? "Factory 1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSave, setActionSave] = useState<FactorySave | null>(null);
  const [renameName, setRenameName] = useState("");
  const renameInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelConfirm = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const selected =
    kind !== "open"
      ? findFactoryByName(saves, name)
      : saves.find((saved) => saved.id === selectedId);
  const overwriteId = kind !== "open" ? selected?.id : undefined;
  const renameConflict = findFactoryByName(saves, renameName);
  const duplicateRename = renameConflict && renameConflict.id !== actionSave?.id;

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
    if (mode === "rename") {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
    if ((mode === "open" || mode === "save" || mode === "import") && returnFocusId.current) {
      const row = document.getElementById(`factory-row-${returnFocusId.current}`);
      const fallback =
        nameInput.current ??
        list.current?.querySelector<HTMLButtonElement>("button[data-factory-row]");
      (row ?? fallback)?.focus();
      returnFocusId.current = null;
    }
  }, [mode]);
  const initialFocus = useCallback(() => (kind !== "open" ? nameInput.current : null), [kind]);
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
  const openDelete = useCallback((saved: FactorySave) => {
    returnFocusId.current = saved.id;
    setError(null);
    setActionSave(saved);
    setMode("delete");
  }, []);
  const openRename = useCallback((saved: FactorySave) => {
    returnFocusId.current = saved.id;
    setError(null);
    setActionSave(saved);
    setRenameName(saved.name);
    setMode("rename");
  }, []);
  const cancel = useCallback(() => {
    setError(null);
    setMode(kind);
  }, [kind]);
  const changeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    [],
  );
  const changeRenameName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRenameName(event.target.value);
    setError(null);
  }, []);
  const selectText = useCallback(
    (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
    [],
  );
  const selectSave = useCallback(
    (saved: FactorySave) => {
      if (kind !== "open") setName(saved.name);
      else setSelectedId(saved.id);
    },
    [kind],
  );
  const openFactory = useCallback(
    (id: string) => {
      if (!busy && id !== activeSave?.id)
        void run(async () => {
          await onLoad(id);
          close();
        });
    },
    [busy, activeSave, run, onLoad, close],
  );
  const load = useCallback(() => {
    if (selectedId) openFactory(selectedId);
  }, [selectedId, openFactory]);
  const navigateRows = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (busy || !(event.target instanceof HTMLButtonElement) || !event.target.dataset.factoryRow)
        return;
      const rows = Array.from(
        event.currentTarget
          .closest("ul")
          ?.querySelectorAll<HTMLButtonElement>("button[data-factory-row]") ?? [],
      );
      const index = rows.indexOf(event.target);
      const next =
        event.key === "ArrowDown"
          ? Math.min(index + 1, rows.length - 1)
          : event.key === "ArrowUp"
            ? Math.max(index - 1, 0)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? rows.length - 1
                : null;
      if (next === null) return;
      event.preventDefault();
      const row = rows[next];
      const saved = saves.find((entry) => entry.id === row?.dataset.factoryRow);
      if (saved) {
        selectSave(saved);
        row?.focus();
      }
    },
    [busy, saves, selectSave],
  );
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
    if (!actionSave) return;
    void run(async () => {
      await onDelete(actionSave.id);
      setSaves((previous) => previous.filter((entry) => entry.id !== actionSave.id));
      if (selectedId === actionSave.id) setSelectedId(null);
      setMode(kind);
      setActionSave(null);
    });
  }, [actionSave, selectedId, kind, run, onDelete]);
  const rename = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy || !actionSave || !renameName.trim() || duplicateRename) return;
      void run(async () => {
        const renamed = await onRename(actionSave.id, renameName.trim());
        setSaves((previous) =>
          previous.map((entry) => (entry.id === renamed.id ? renamed : entry)),
        );
        if (kind !== "open" && selected?.id === renamed.id) setName(renamed.name);
        setMode(kind);
        setActionSave(null);
      });
    },
    [busy, actionSave, renameName, duplicateRename, run, onRename, kind, selected],
  );
  const openJson = useCallback(() => fileInput.current?.click(), []);
  const readJson = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file && onImport) void run(() => onImport(file));
    },
    [onImport, run],
  );
  const saveJson = useCallback(() => {
    if (!onExport || !name.trim()) return;
    void run(async () => {
      onExport(name.trim());
      close();
    });
  }, [onExport, name, run, close]);

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
            {mode === "save" || mode === "import"
              ? kind === "import"
                ? "Import factory"
                : "Save as…"
              : mode === "overwrite"
                ? "Overwrite factory?"
                : mode === "delete"
                  ? "Delete factory?"
                  : mode === "rename"
                    ? "Rename factory"
                    : "Open factory"}
          </DialogTitle>
          <DialogDescription>
            {mode === "save" || mode === "import"
              ? kind === "import"
                ? "Choose a name for the imported factory."
                : "Enter a name or select a factory to overwrite."
              : mode === "overwrite"
                ? `Replace “${selected?.name ?? "this factory"}” with ${kind === "import" ? "the imported factory" : "the current canvas"}? This cannot be undone.`
                : mode === "delete"
                  ? `Delete “${actionSave?.name ?? "this factory"}” from your saved factories? This cannot be undone.`
                  : mode === "rename"
                    ? `Choose a new name for “${actionSave?.name ?? "this factory"}”.`
                    : "Saved in this browser."}
          </DialogDescription>
        </DialogHeader>
        {(mode === "open" || mode === "save" || mode === "import") && (
          <form
            onSubmit={mode === "save" || mode === "import" ? save : undefined}
            className="space-y-4"
          >
            {(mode === "save" || mode === "import") && (
              <div className="space-y-2">
                <label htmlFor="factory-name" className="text-sm font-medium">
                  Factory name
                </label>
                <Input
                  ref={nameInput}
                  id="factory-name"
                  value={name}
                  onChange={changeName}
                  onFocus={selectText}
                  disabled={busy}
                  required
                />
              </div>
            )}
            <ul
              ref={list}
              className="max-h-[40dvh] space-y-2 overflow-y-auto pr-3 [scrollbar-gutter:stable]"
              aria-label="Saved factories"
              aria-busy={loading}
            >
              {loading ? (
                <li>
                  <output className="block py-6 text-center text-muted-foreground">
                    Loading factories…
                  </output>
                </li>
              ) : !saves.length ? (
                <li>
                  <p className="py-6 text-center text-muted-foreground">No saved factories yet.</p>
                </li>
              ) : (
                saves.map((saved) => (
                  <FactorySaveRow
                    key={saved.id}
                    saved={saved}
                    selected={selected?.id === saved.id}
                    current={saved.id === activeSave?.id}
                    disabled={busy}
                    canOpen={kind === "open"}
                    onSelect={selectSave}
                    onOpen={openFactory}
                    onRename={openRename}
                    onDelete={openDelete}
                    onNavigate={navigateRows}
                  />
                ))
              )}
            </ul>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {mode === "open" && onImport && (
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                aria-label="Import factory JSON"
                onChange={readJson}
                disabled={busy}
              />
            )}
            <DialogFooter className="flex-row flex-wrap items-center justify-between sm:justify-between">
              {mode === "open" && onImport && (
                <Button type="button" variant="outline" disabled={busy} onClick={openJson}>
                  <UploadIcon />
                  Open JSON…
                </Button>
              )}
              {mode === "save" && onExport && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !name.trim()}
                  onClick={saveJson}
                >
                  <DownloadIcon />
                  Download JSON
                </Button>
              )}
              <div className="ml-auto flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={close}>
                  Cancel
                </Button>
                {mode === "save" || mode === "import" ? (
                  <Button type="submit" disabled={busy || loading || !name.trim()}>
                    {busy
                      ? kind === "import"
                        ? "Importing…"
                        : "Saving…"
                      : kind === "import"
                        ? "Import"
                        : "Save"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={busy || !selected || selectedId === activeSave?.id}
                    onClick={load}
                  >
                    {busy ? "Opening…" : "Open"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        )}
        {mode === "rename" && (
          <form onSubmit={rename} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="rename-factory" className="text-sm font-medium">
                Factory name
              </label>
              <Input
                ref={renameInput}
                id="rename-factory"
                value={renameName}
                onChange={changeRenameName}
                onFocus={selectText}
                disabled={busy}
                required
                aria-invalid={Boolean(duplicateRename || error)}
                aria-describedby={duplicateRename || error ? "rename-error" : undefined}
              />
              {(duplicateRename || error) && (
                <p id="rename-error" role="alert" className="text-sm text-destructive">
                  {duplicateRename
                    ? `A factory named “${renameName.trim()}” already exists. Choose another name.`
                    : error}
                </p>
              )}
            </div>
            <DialogFooter className="flex-row justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy || !renameName.trim() || Boolean(duplicateRename)}
              >
                {busy ? "Renaming…" : "Rename"}
              </Button>
            </DialogFooter>
          </form>
        )}
        {(mode === "delete" || mode === "overwrite") && (
          <>
            {mode === "delete" && actionSave?.id === activeSave?.id && (
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
