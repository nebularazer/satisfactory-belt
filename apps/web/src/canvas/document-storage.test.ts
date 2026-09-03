import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDocument,
} from "./document";
import {
  attachCanvasAutosave,
  createIndexedDbDocumentStorage,
  type CanvasDocumentStorage,
} from "./document-storage";
import { createCanvasEditor } from "./editor";

const documentWith = (...ids: readonly string[]): CanvasDocument => ({
  nodes: ids.map((id, index) => ({
    height: 96,
    id,
    label: id,
    width: 176,
    x: index * 32,
    y: index * 32,
  })),
  version: CANVAS_DOCUMENT_VERSION,
});

describe("IndexedDB canvas document storage", () => {
  it("persists the workspace and the full named-save lifecycle", async () => {
    const storage = createIndexedDbDocumentStorage(new IDBFactory());
    const initialDocument = documentWith("node-1");
    const updatedDocument = documentWith("node-1", "node-2");

    await storage.saveWorkspace(initialDocument, null);
    await expect(storage.loadWorkspace()).resolves.toEqual({
      activeSave: null,
      document: initialDocument,
    });

    const created = await storage.saveNamed({
      document: initialDocument,
      id: "save-1",
      name: "  First canvas  ",
    });
    expect(created).toMatchObject({
      document: initialDocument,
      id: "save-1",
      name: "First canvas",
    });
    await expect(storage.loadWorkspace()).resolves.toEqual({
      activeSave: created,
      document: initialDocument,
    });

    const updated = await storage.saveNamed({
      document: updatedDocument,
      id: created.id,
    });
    expect(updated).toMatchObject({
      document: updatedDocument,
      id: created.id,
      name: created.name,
    });
    await expect(storage.listNamed()).resolves.toEqual([updated]);

    await storage.deleteNamed(updated.id);
    await expect(storage.listNamed()).resolves.toEqual([]);
    await expect(storage.loadWorkspace()).resolves.toEqual({
      activeSave: null,
      document: updatedDocument,
    });
  });
});

describe("canvas autosave", () => {
  it("debounces document changes and flushes the latest document", async () => {
    vi.useFakeTimers();
    const saveWorkspace = vi
      .fn<CanvasDocumentStorage["saveWorkspace"]>()
      .mockResolvedValue();
    const editor = createCanvasEditor({ idFactory: () => crypto.randomUUID() });
    const storage: CanvasDocumentStorage = {
      deleteNamed: async () => undefined,
      listNamed: async () => [],
      loadWorkspace: async () => ({ activeSave: null, document: null }),
      saveWorkspace,
      saveNamed: async () => {
        throw new Error("Not implemented by this test double.");
      },
    };
    const detach = attachCanvasAutosave(editor, storage, () => "active-id");

    editor.dispatch({ type: "node.create", at: { x: 0, y: 0 } });
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    await vi.advanceTimersByTimeAsync(300);

    expect(saveWorkspace).toHaveBeenCalledOnce();
    expect(saveWorkspace.mock.calls[0]?.[0].nodes).toHaveLength(2);
    expect(saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: expect.any(Array) }),
      "active-id",
    );
    detach();
    vi.useRealTimers();
  });
});
