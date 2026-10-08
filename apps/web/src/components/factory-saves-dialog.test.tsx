import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FactorySavesDialog } from "./factory-saves-dialog";

const saves = [
  { id: "iron", name: "Iron factory", updatedAt: 0 },
  { id: "copper", name: "Copper factory", updatedAt: 0 },
];
const finalFocus = () => null;

function setup(save: boolean | "import" = false) {
  const props = {
    store: { list: vi.fn().mockResolvedValue(saves) },
    activeSave: saves[0]!,
    kind: save === "import" ? ("import" as const) : save ? ("save" as const) : ("open" as const),
    initialName: save === "import" ? "Imported factory" : undefined,
    onOpenChange: vi.fn(),
    onLoad: vi.fn().mockResolvedValue(undefined),
    onSaveAs: vi.fn().mockResolvedValue(undefined),
    onOverwrite: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn(async (id: string, name: string) => ({
      ...saves.find((entry) => entry.id === id)!,
      name,
    })),
    finalFocus,
  };
  render(<FactorySavesDialog {...props} />);
  return props;
}
async function rowAction(user: ReturnType<typeof userEvent.setup>, name: string, action: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

it("selects a saved factory and only loads after clicking Open", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("button", { name: "Iron factory" });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Open" }).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Copper factory" }));
  expect(props.onLoad).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(props.onLoad).toHaveBeenCalledWith("copper"));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("requires deletion confirmation, focuses Cancel, and removes the deleted save from the list", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("button", { name: "Iron factory" });
  await rowAction(user, "Iron factory", "Delete…");
  expect(screen.getByText(/current canvas will stay open/)).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
  );
  await user.keyboard("{Enter}");
  expect(props.onDelete).not.toHaveBeenCalled();
  await rowAction(user, "Iron factory", "Delete…");
  await user.click(screen.getByRole("button", { name: "Delete factory" }));
  await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("iron"));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Iron factory" })).toBeNull());
  expect(screen.getByRole("button", { name: "Copper factory" })).toBeTruthy();
});

it("rejects blank names and saves a named copy through the form", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  const input = screen.getByRole("textbox", { name: "Factory name" });
  await user.clear(input);
  await user.type(input, "   ");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled).toBe(true);
  await user.clear(input);
  await user.type(input, "  Steel production  ");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(props.onSaveAs).toHaveBeenCalledWith("Steel production"));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
  expect(props.onLoad).not.toHaveBeenCalled();
});

it("keeps the dialog open on failure and allows retrying", async () => {
  const user = userEvent.setup();
  const props = setup();
  props.onLoad.mockRejectedValueOnce(new Error("Storage unavailable"));
  await user.click(await screen.findByRole("button", { name: "Copper factory" }));
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Storage unavailable");
  expect(props.onOpenChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
});

it("selects an existing save and confirms before overwriting it", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  await user.click(await screen.findByRole("button", { name: "Copper factory" }));
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" }).value).toBe(
    "Copper factory",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/Replace “Copper factory”/)).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
  );
  await user.keyboard("{Enter}");
  expect(props.onOverwrite).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(await screen.findByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOverwrite).toHaveBeenCalledWith("copper"));
  expect(props.onSaveAs).not.toHaveBeenCalled();
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("retains overwrite selection on failure and lets the user retry", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  props.onOverwrite.mockRejectedValueOnce(new Error("Storage full"));
  await user.click(await screen.findByRole("button", { name: "Copper factory" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(await screen.findByRole("button", { name: "Overwrite factory" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Storage full");
  expect(props.onOpenChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
});

it("uses the typed name to select an existing factory and requires overwrite confirmation", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  expect(screen.queryByRole("radio", { name: "New factory" })).toBeNull();
  const input = screen.getByRole("textbox", { name: "Factory name" });
  await screen.findByRole("button", { name: "Copper factory" });
  await user.clear(input);
  await user.type(input, "  Copper factory  ");
  expect(screen.getByRole("button", { name: "Copper factory" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  await user.keyboard("{Enter}");
  await screen.findByRole("button", { name: "Overwrite factory" });
  expect(props.onSaveAs).not.toHaveBeenCalled();
  expect(props.onOverwrite).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOverwrite).toHaveBeenCalledWith("copper"));
});

it("creates a new factory when the selected factory's name is edited to an unused name", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  await user.click(await screen.findByRole("button", { name: "Copper factory" }));
  const input = screen.getByRole("textbox", { name: "Factory name" });
  await user.clear(input);
  await user.type(input, "Steel factory");
  expect(screen.getByRole("button", { name: "Copper factory" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
  await user.keyboard("{Enter}");
  await waitFor(() => expect(props.onSaveAs).toHaveBeenCalledWith("Steel factory"));
  expect(props.onOverwrite).not.toHaveBeenCalled();
});

it("checks current saves before creating so a name saved in another tab prompts overwrite", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  await screen.findByRole("button", { name: "Copper factory" });
  props.store.list.mockResolvedValue([
    ...saves,
    { id: "steel", name: "Steel factory", updatedAt: 1 },
  ]);
  const input = screen.getByRole("textbox", { name: "Factory name" });
  await user.clear(input);
  await user.type(input, "Steel factory");
  await user.keyboard("{Enter}");
  await screen.findByText(/Replace “Steel factory”/);
  expect(props.onSaveAs).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOverwrite).toHaveBeenCalledWith("steel"));
});

it("allows renaming an imported factory before saving it", async () => {
  const user = userEvent.setup();
  const props = setup("import");
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" });
  expect(input.value).toBe("Imported factory");
  await user.clear(input);
  await user.type(input, "Renamed factory");
  await user.click(screen.getByRole("button", { name: "Import" }));
  await waitFor(() => expect(props.onSaveAs).toHaveBeenCalledWith("Renamed factory"));
  expect(props.onOverwrite).not.toHaveBeenCalled();
});

it("confirms an import name conflict and lets the user return to change the name", async () => {
  const user = userEvent.setup();
  const props = setup("import");
  const input = screen.getByRole("textbox", { name: "Factory name" });
  await user.clear(input);
  await user.type(input, "Copper factory");
  await user.click(screen.getByRole("button", { name: "Import" }));
  expect(await screen.findByText(/with the imported factory/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onOverwrite).not.toHaveBeenCalled();
  await user.clear(screen.getByRole("textbox", { name: "Factory name" }));
  await user.type(screen.getByRole("textbox", { name: "Factory name" }), "Different name");
  await user.click(screen.getByRole("button", { name: "Import" }));
  await waitFor(() => expect(props.onSaveAs).toHaveBeenCalledWith("Different name"));
});

it.each([false, true])(
  "renames a selected factory in open/save mode %s with inline validation and retry",
  async (save) => {
    const user = userEvent.setup();
    const props = setup(save);
    await user.click(await screen.findByRole("button", { name: "Copper factory" }));
    await rowAction(user, "Copper factory", "Rename…");
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    await user.clear(input);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Rename" }).disabled).toBe(true);
    await user.type(input, "Iron factory");
    expect(screen.getByRole("alert").textContent).toContain("already exists");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Rename" }).disabled).toBe(true);
    expect(props.onRename).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "Steel factory");
    props.onRename.mockRejectedValueOnce(new Error("Storage full"));
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Storage full");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const row = await screen.findByRole("button", { name: "Steel factory" });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(props.onRename).toHaveBeenLastCalledWith("copper", "Steel factory");
    expect(props.onOverwrite).not.toHaveBeenCalled();
    expect(props.onSaveAs).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    if (save)
      expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" }).value).toBe(
        "Steel factory",
      );
  },
);

it("deletes a row from Save as without changing the selected destination", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  await rowAction(user, "Copper factory", "Delete…");
  expect(screen.getByText(/Delete “Copper factory”/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Delete factory" }));
  await screen.findByRole("dialog", { name: "Save as…" });
  expect(props.onDelete).toHaveBeenCalledWith("copper");
  expect(screen.queryByRole("button", { name: "Copper factory" })).toBeNull();
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" }).value).toBe(
    "Iron factory",
  );
});

it("supports keyboard row selection and double-click opens only another factory", async () => {
  const user = userEvent.setup();
  const props = setup();
  const current = await screen.findByRole("button", { name: "Iron factory" });
  await user.dblClick(current);
  expect(props.onLoad).not.toHaveBeenCalled();
  await user.keyboard("{ArrowDown}");
  const copper = screen.getByRole("button", { name: "Copper factory" });
  expect(document.activeElement).toBe(copper);
  expect(copper.getAttribute("aria-pressed")).toBe("true");
  await user.dblClick(copper);
  await waitFor(() => expect(props.onLoad).toHaveBeenCalledExactlyOnceWith("copper"));
});

it("filters factory names without case sensitivity and navigates only visible results", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("button", { name: "Copper factory" });
  const search = screen.getByRole("searchbox", { name: "Search factories" });
  await user.type(search, "  COPPER  ");
  expect(screen.queryByRole("button", { name: "Iron factory" })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Open" }).disabled).toBe(true);
  await user.keyboard("{ArrowDown}");
  const copper = screen.getByRole("button", { name: "Copper factory" });
  expect(document.activeElement).toBe(copper);
  expect(copper.getAttribute("aria-pressed")).toBe("true");
  await user.clear(search);
  await user.type(search, "missing");
  expect(screen.getByRole("status").textContent).toContain("No factories match");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Open" }).disabled).toBe(true);
  await user.clear(search);
  expect(screen.getByRole("button", { name: "Copper factory" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(props.store.list).toHaveBeenCalledTimes(1);
  expect(props.onLoad).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(props.onLoad).toHaveBeenCalledWith("copper"));
});

it("keeps the save name separate from search and confirms overwrites for filtered-out factories", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  await screen.findByRole("button", { name: "Copper factory" });
  const search = screen.getByRole("searchbox", { name: "Search factories" });
  await user.type(search, "Iron");
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog", { name: "Save as…" })).toBeTruthy();
  const name = screen.getByRole<HTMLInputElement>("textbox", { name: "Factory name" });
  expect(name.value).toBe("Iron factory");
  await user.clear(name);
  await user.type(name, "Copper factory");
  expect(screen.queryByRole("button", { name: "Copper factory" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Overwrite factory" });
  expect(props.onSaveAs).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOverwrite).toHaveBeenCalledWith("copper"));
});

it("checks rename uniqueness against factories hidden by search", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("button", { name: "Copper factory" });
  await user.type(screen.getByRole("searchbox", { name: "Search factories" }), "Copper");
  await rowAction(user, "Copper factory", "Rename…");
  const name = screen.getByRole("textbox", { name: "Factory name" });
  await user.clear(name);
  await user.type(name, "Iron factory");
  expect(screen.getByRole("alert").textContent).toContain("already exists");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Rename" }).disabled).toBe(true);
  expect(props.onRename).not.toHaveBeenCalled();
});
