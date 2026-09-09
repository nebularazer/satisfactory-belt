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

it("reopens all saved settings and requires an explicit replacement after preview", async () => {
  const settings = {
    outputs: [
      { itemId: "Desc_ModularFrame_C", ratePerMinute: 10 },
      { itemId: "Desc_IronPlate_C", ratePerMinute: 20 },
    ],
    allowedAlternateIds: ["Recipe_Alternate_Screw_C"],
    pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
    resourceNodes: [
      {
        itemId: "Desc_OreIron_C",
        buildableId: "Build_MinerMk1_C",
        impure: 0,
        normal: 8,
        pure: 0,
        maximumClockPercent: 100,
      },
    ],
  };
  const apply = vi.fn();
  const onClose = vi.fn();
  const onGenerate = vi.fn().mockResolvedValue({
    oldNodeCount: 7,
    newNodeCount: 6,
    retainedConnections: 1,
    disconnectedConnections: ["Iron Rod / Manual assembler"],
    apply,
  });
  render(
    <AutoBuildDialog
      itemId="Desc_ModularFrame_C"
      sectionName="Modular Frame · 10/min"
      sectionNodeCount={7}
      initialSettings={settings}
      onClose={onClose}
      onGenerate={onGenerate}
    />,
  );
  expect(
    screen.getByRole("spinbutton", { name: "Modular Frame rate" }),
  ).toHaveValue(10);
  expect(
    screen.getByRole("spinbutton", { name: "Iron Plate rate" }),
  ).toHaveValue(20);
  fireEvent.click(screen.getByRole("button", { name: "Preview replacement" }));
  const replace = await screen.findByRole("button", {
    name: "Replace and disconnect (1)",
  });
  expect(onGenerate.mock.calls[0][0]).toEqual(settings);
  expect(apply).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Iron Rod / Manual assembler",
  );
  fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
  expect(apply).not.toHaveBeenCalled();
  expect(
    screen.getByRole("spinbutton", { name: "Iron Plate rate" }),
  ).toHaveValue(20);
  fireEvent.click(screen.getByRole("button", { name: "Preview replacement" }));
  fireEvent.click(
    await screen.findByRole("button", { name: replace.textContent! }),
  );
  expect(apply).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});
