import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { minerFlowFixture } from "@/test/flow-fixture";

import { InspectorLink } from "./inspector-link";

it("keeps link allocation visible in an unfinished plan", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  render(<InspectorLink link={document.links[0]!} editor={editor} assets={assets} />);
  expect(screen.getByText("30 items/min")).toBeTruthy();
  expect(screen.queryByText("Allocation unavailable until production is balanced")).toBeNull();
});
