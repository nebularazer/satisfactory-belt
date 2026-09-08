import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoBuildDialog } from "./auto-build-dialog";

afterEach(cleanup);

describe("Auto-build dialog", () => {
  it("retains settings after a failure and allows retry", async () => {
    const onClose = vi.fn();
    const onGenerate = vi
      .fn()
      .mockRejectedValueOnce(new Error("These recipes cannot be balanced."))
      .mockResolvedValueOnce(undefined);
    render(
      <AutoBuildDialog
        itemId="Desc_ModularFrame_C"
        onClose={onClose}
        onGenerate={onGenerate}
      />,
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Modular Frame rate" }),
      { target: { value: "20" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate production plan" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "These recipes cannot be balanced.",
    );
    expect(
      screen.getByRole("spinbutton", { name: "Modular Frame rate" }),
    ).toHaveValue(20);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate production plan" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onGenerate.mock.calls[1][0].outputs).toEqual([
      { itemId: "Desc_ModularFrame_C", ratePerMinute: 20 },
    ]);
  });

  it("cancels an active request while showing indeterminate progress", async () => {
    const onClose = vi.fn();
    const onGenerate = vi.fn(() => new Promise<void>(() => {}));
    render(
      <AutoBuildDialog
        itemId="Desc_ModularFrame_C"
        onClose={onClose}
        onGenerate={onGenerate}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate production plan" }),
    );
    expect(
      screen.getByRole("progressbar", { name: "Generating production" }),
    ).not.toHaveAttribute("value");
    expect(screen.getByRole("button", { name: "Building…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      (onGenerate.mock.calls[0] as unknown as [unknown, AbortSignal])[1]
        .aborted,
    ).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
