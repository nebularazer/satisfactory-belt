/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Controlled test harness. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { inspectorAssets } from "@/test/inspector-fixture";

import { InspectorChoice } from "./inspector-choice";

const options = [
  { value: "iron", label: "Iron Plate", iconId: "iron" },
  { value: "copper", label: "Copper Sheet", iconId: "copper" },
  { value: "coal", label: "Coal", disabled: true },
];

it("starts a fresh search, preserves cancellation, shows selected icons and supports keyboard selection", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const assets = inspectorAssets();
  function Harness() {
    const [value, setValue] = useState("iron");
    return (
      <InspectorChoice
        label="Recipe"
        value={value}
        options={options}
        assets={assets}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole("combobox");
  expect(trigger.querySelector("img")?.src).toContain("iron.webp");
  fireEvent.click(trigger);
  const search = await screen.findByLabelText<HTMLInputElement>("Search Recipe");
  await waitFor(() => expect(document.activeElement).toBe(search));
  expect(search.value).toBe("");
  await user.type(search, "Copper");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Escape}");
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  const reopened = await screen.findByLabelText<HTMLInputElement>("Search Recipe");
  expect(reopened.value).toBe("");
  const blocked = screen.getByRole("option", { name: /Coal/ });
  expect(blocked.getAttribute("aria-disabled")).toBe("true");
  await user.click(blocked);
  expect(changed).not.toHaveBeenCalled();
  await user.type(reopened, "Copper");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(changed).toHaveBeenLastCalledWith("copper");
  expect(within(trigger).getByText("Copper Sheet")).toBeTruthy();
  expect(trigger.querySelector("img")?.src).toContain("copper.webp");
});
