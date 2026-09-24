import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { InspectorSink } from "./inspector-sink";

it("explains surplus and supplier limits without rate controls", () => {
  render(<InspectorSink />);
  expect(screen.getByText(/Automatic suppliers slow down/)).toBeTruthy();
  expect(screen.getByText(/set an output or machine limit/)).toBeTruthy();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
