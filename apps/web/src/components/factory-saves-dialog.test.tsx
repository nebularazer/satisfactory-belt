import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FactorySavesDialog } from "./factory-saves-dialog";

const saves = [
  { id: "iron", name: "Iron factory", updatedAt: 0 },
  { id: "copper", name: "Copper factory", updatedAt: 0 },
];
const finalFocus = () => null;

function setup(save = false) {
  const props = {
    store: { list: vi.fn().mockResolvedValue(saves) },
    activeSave: saves[0]!,
    kind: save ? ("save" as const) : ("open" as const),
    onOpenChange: vi.fn(),
    onLoad: vi.fn().mockResolvedValue(undefined),
    onSaveAs: vi.fn().mockResolvedValue(undefined),
    onOverwrite: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    finalFocus,
  };
  render(<FactorySavesDialog {...props} />);
  return props;
}

it("selects a saved factory and only loads after clicking Open", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("radio", { name: /Iron factory/ });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Open" }).disabled).toBe(true);
  await user.click(screen.getByRole("radio", { name: /Copper factory/ }));
  expect(props.onLoad).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(props.onLoad).toHaveBeenCalledWith("copper"));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("requires deletion confirmation, focuses Cancel, and removes the deleted save from the list", async () => {
  const user = userEvent.setup();
  const props = setup();
  await screen.findByRole("radio", { name: /Iron factory/ });
  await user.click(screen.getByRole("button", { name: "Delete…" }));
  expect(screen.getByText(/current canvas will stay open/)).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
  );
  await user.keyboard("{Enter}");
  expect(props.onDelete).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete…" }));
  await user.click(screen.getByRole("button", { name: "Delete factory" }));
  await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("iron"));
  await waitFor(() => expect(screen.queryByRole("radio", { name: /Iron factory/ })).toBeNull());
  expect(screen.getByRole("radio", { name: /Copper factory/ })).toBeTruthy();
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
  await user.click(await screen.findByRole("radio", { name: /Copper factory/ }));
  await user.click(screen.getByRole("button", { name: "Open" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Storage unavailable");
  expect(props.onOpenChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
});

it("selects an existing save and confirms before overwriting it", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  await user.click(await screen.findByRole("radio", { name: /Copper factory/ }));
  expect(screen.queryByRole("textbox", { name: "Factory name" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Overwrite…" }));
  expect(screen.getByText(/Replace “Copper factory”/)).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
  );
  await user.keyboard("{Enter}");
  expect(props.onOverwrite).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Overwrite…" }));
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOverwrite).toHaveBeenCalledWith("copper"));
  expect(props.onSaveAs).not.toHaveBeenCalled();
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("retains overwrite selection on failure and lets the user retry", async () => {
  const user = userEvent.setup();
  const props = setup(true);
  props.onOverwrite.mockRejectedValueOnce(new Error("Storage full"));
  await user.click(await screen.findByRole("radio", { name: /Copper factory/ }));
  await user.click(screen.getByRole("button", { name: "Overwrite…" }));
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Storage full");
  expect(props.onOpenChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Overwrite factory" }));
  await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
});
