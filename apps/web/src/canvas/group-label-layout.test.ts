import { expect, it } from "vitest";
import { groupInspectIcon } from "./group-label-layout";
import { groupBounds, GROUP_PADDING } from "./group-bounds";
import { testCanvasNode } from "./test-fixtures";

it("snaps all group edges outward and leaves space for the vector inspect icon", () => {
  const node = testCanvasNode("a", 37, 53);
  const bounds = groupBounds([node]);
  for (const edge of [
    bounds.x,
    bounds.y,
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  ])
    expect(Math.abs(edge % 16)).toBe(0);
  expect(node.x - bounds.x).toBeGreaterThanOrEqual(GROUP_PADDING);
  expect(node.y - bounds.y).toBeGreaterThanOrEqual(GROUP_PADDING);
  const icon = groupInspectIcon(bounds);
  expect(icon.x).toBeGreaterThan(bounds.x);
  expect(icon.y).toBeGreaterThan(bounds.y);
  expect(icon.y + icon.height).toBeLessThan(node.y);
  expect(icon.width).toBe(icon.height);
});
