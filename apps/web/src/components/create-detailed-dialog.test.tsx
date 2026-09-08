import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateDetailedDialog } from "./create-detailed-dialog";

afterEach(cleanup);

describe("Create Detailed dialog", () => {
  it("keeps speed limits after an error and retries", async () => {
    const onClose = vi.fn();
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("The balancer needs a faster conveyor."))
      .mockResolvedValueOnce(undefined);
    render(
      <CreateDetailedDialog
        sourceName="Frames"
        onClose={onClose}
        onCreate={onCreate}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Maximum conveyor speed" }),
    ).toHaveValue("conveyor-mk1");
    expect(
      screen.getByRole("combobox", { name: "Maximum pipeline speed" }),
    ).toHaveValue("pipeline-mk1");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Maximum conveyor speed" }),
      { target: { value: "conveyor-mk3" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Detailed" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "faster conveyor",
    );
    expect(
      screen.getByRole("combobox", { name: "Maximum conveyor speed" }),
    ).toHaveValue("conveyor-mk3");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Maximum pipeline speed" }),
      { target: { value: "pipeline-mk1" } },
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Detailed" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onCreate.mock.calls[1].slice(0, 2)).toEqual([
      { conveyorTierId: "conveyor-mk3", pipelineTierId: "pipeline-mk1" },
      "Frames",
    ]);
  });

  it("shows actual stages and aborts work on cancellation", () => {
    const onClose = vi.fn();
    let signal: AbortSignal | undefined;
    render(
      <CreateDetailedDialog
        onClose={onClose}
        onCreate={async (_settings, _name, abort, onStage) => {
          signal = abort;
          onStage("Building balancers");
          await new Promise(() => {});
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Detailed" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Building balancers… Step 2 of 5",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(
      screen.getByRole("combobox", { name: "Maximum conveyor speed" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
