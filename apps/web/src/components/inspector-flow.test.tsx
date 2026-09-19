import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { minerFlowFixture } from "@/test/flow-fixture";

import { InspectorBody } from "./inspector-body";

it("edits targets and clock, with count buttons preserving production and no machine-limit control", async () => {
  const user = userEvent.setup();
  const { assets, smelter } = minerFlowFixture();
  assets.catalog.items.Desc_CrystalShard_C = {
    ...assets.catalog.items.iron!,
    id: "Desc_CrystalShard_C",
  };
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [{ ...smelter, flow: { targets: { iron: 120 } } }],
    links: [],
  });
  function Harness() {
    const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    return <InspectorBody node={snapshot.state.nodes[0]!} editor={editor} assets={assets} />;
  }
  render(<Harness />);
  async function enter(label: string, value: string) {
    const field = screen.getByRole("textbox", { name: label });
    await user.clear(field);
    await user.type(field, value);
    await user.tab();
  }
  await enter("Iron Ingot target", "150");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(screen.queryByRole("textbox", { name: "Machine limit" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add machine" }));
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 6 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(250 / 3) }),
    ),
  });
  await enter("Clock speed", "200");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 3 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(500 / 3) }),
    ),
  });
  await enter("Iron Ingot target", "300");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("300");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 5 }, () => expect.objectContaining({ clockPercent: 200 })),
  });
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Remove last machine" }).disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Remove last machine" }));
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 4 }, () => expect.objectContaining({ clockPercent: 250 })),
  });
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Remove last machine" }).disabled,
  ).toBe(true);
  expect(screen.queryByText(/Target shortfall/)).toBeNull();
});
