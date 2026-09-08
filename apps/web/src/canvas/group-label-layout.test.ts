import { expect, it } from "vitest";
import { groupLabelLayout } from "./group-label-layout";

const measure = (text: string, size: number) => text.length * size * 0.55;
it("uses one fixed font size and fits labels inside the header", () => {
  for (const name of [
    "Iron Ore Extraction",
    "Reinforced Iron Plate",
    "A".repeat(160),
    "Northern steel processing and distribution facility",
  ]) {
    const layout = groupLabelLayout({ name, count: 8, width: 368 }, measure);
    expect(layout.fontSize).toBe(18);
    expect(layout.visible).toBe(true);
    for (const line of layout.text.split("\n"))
      expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(328);
    expect(
      layout.text.split("\n").length * layout.lineHeight,
    ).toBeLessThanOrEqual(44);
  }
});
it("wraps and truncates based on available width alone", () => {
  expect(
    groupLabelLayout(
      { name: "Reinforced Iron Plate production", count: 3, width: 296 },
      measure,
    ).text,
  ).toContain("\n");
  expect(
    groupLabelLayout(
      {
        name: "Very long reinforced iron plate production and distribution",
        count: 3,
        width: 296,
      },
      measure,
    ).text,
  ).toContain("…");
});
