import { describe, expect, it, vi } from "vitest";

import {
  attachCanvasAutosave,
  type CanvasDocumentStorage,
} from "./document-storage";
import { createCanvasEditor } from "./editor";

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
