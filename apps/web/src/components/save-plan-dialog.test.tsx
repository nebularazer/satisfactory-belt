import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CanvasDocumentStorage,
  SavedCanvasDocument,
} from "@/canvas/document-storage";
import type { CanvasDocument } from "@/canvas/document";

import { SavePlanDialog } from "./save-plan-dialog";

const document: CanvasDocument = { nodes: [], version: 1 };
const existingSave: SavedCanvasDocument = {
  document,
  id: "existing-id",
  name: "Existing plan",
  updatedAt: "2026-09-03T12:00:00.000Z",
};

function createStorage(
  saveNamed: CanvasDocumentStorage["saveNamed"],
): CanvasDocumentStorage {
  return {
    deleteNamed: async () => undefined,
    listNamed: async () => [existingSave],
    loadWorkspace: async () => ({ activeSave: null, document: null }),
    saveNamed,
    saveWorkspace: async () => undefined,
  };
}

afterEach(cleanup);

describe("SavePlanDialog", () => {
  it("creates a separate plan for a new name", async () => {
    const saved = { ...existingSave, id: "new-id", name: "New plan" };
    const saveNamed = vi.fn<CanvasDocumentStorage["saveNamed"]>();
    saveNamed.mockResolvedValue(saved);
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();

    render(
      <SavePlanDialog
        activeSave={existingSave}
        currentDocument={document}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        open
        storage={createStorage(saveNamed)}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Plan name" }), {
      target: { value: "New plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as new" }));

    await waitFor(() =>
      expect(saveNamed).toHaveBeenCalledWith({
        document,
        name: "New plan",
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("confirms before overwriting an existing plan", async () => {
    const saveNamed = vi.fn<CanvasDocumentStorage["saveNamed"]>();
    saveNamed.mockResolvedValue(existingSave);

    render(
      <SavePlanDialog
        activeSave={null}
        currentDocument={document}
        onOpenChange={() => undefined}
        onSaved={() => undefined}
        open
        storage={createStorage(saveNamed)}
      />,
    );

    await screen.findByRole("button", { name: /Existing plan/ });
    fireEvent.change(screen.getByRole("textbox", { name: "Plan name" }), {
      target: { value: "existing plan" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Overwrite “Existing plan”" }),
    );

    const confirmation = await screen.findByRole("alertdialog");
    expect(saveNamed).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Overwrite" }),
    );

    await waitFor(() =>
      expect(saveNamed).toHaveBeenCalledWith({
        document,
        id: "existing-id",
        name: "Existing plan",
      }),
    );
  });
});
