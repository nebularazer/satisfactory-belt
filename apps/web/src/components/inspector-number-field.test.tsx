import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { InspectorNumberField } from "./inspector-number-field";

it("keeps invalid drafts local, clamps on commit, steps by one and lets Escape discard edits", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  const props = {
    label: "Clock speed",
    value: 100,
    revision: 0,
    min: 1,
    max: 250,
    onCommit: commit,
  };
  const { rerender } = render(<InspectorNumberField {...props} />);
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" });
  await user.clear(input);
  await user.type(input, "300");
  expect(commit).not.toHaveBeenCalled();
  await user.tab();
  expect(commit).toHaveBeenLastCalledWith(250);
  rerender(<InspectorNumberField {...props} value={250} revision={1} />);
  await user.click(screen.getByRole("button", { name: "Decrease Clock speed by 1" }));
  expect(commit).toHaveBeenLastCalledWith(249);
  await user.clear(input);
  await user.type(input, "20{Escape}");
  expect(input.value).toBe("250");
  expect(commit).toHaveBeenCalledTimes(2);
});

it("rounds integer settings and clears Mixed drafts after an external edit", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  const props = {
    label: "Sloops",
    value: null,
    revision: 0,
    min: 0,
    max: 2,
    integer: true,
    onCommit: commit,
  };
  const { rerender } = render(<InspectorNumberField {...props} />);
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Sloops" });
  expect(input.placeholder).toBe("Mixed");
  await user.type(input, "1.7{Enter}");
  expect(commit).toHaveBeenLastCalledWith(2);
  await user.type(input, "-2");
  rerender(<InspectorNumberField {...props} revision={1} />);
  expect(input.value).toBe("");
  await user.type(input, "-2{Enter}");
  expect(commit).toHaveBeenLastCalledWith(0);
});
