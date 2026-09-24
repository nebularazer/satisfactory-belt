import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { expect, it, vi } from "vitest";

import { ClearCanvasDialog } from "./clear-canvas-dialog";

const finalFocus = () => document.getElementById("canvas");

it("focuses Cancel and only clears after explicit confirmation", async () => {
  const user = userEvent.setup();
  const clear = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    const reopen = useCallback(() => {
      setOpen(true);
    }, []);
    return (
      <>
        <button id="canvas" onClick={reopen}>
          Canvas
        </button>
        <ClearCanvasDialog
          open={open}
          onOpenChange={setOpen}
          onConfirm={clear}
          finalFocus={finalFocus}
        />
      </>
    );
  }
  render(<Harness />);
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
  );
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(clear).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Canvas" })),
  );
  await user.click(screen.getByRole("button", { name: "Canvas" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(clear).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Canvas" }));
  await user.click(screen.getByRole("button", { name: "Clear canvas" }));
  expect(clear).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Canvas" })),
  );
});
