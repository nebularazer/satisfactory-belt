import { expect, it } from "vitest";
import { groupLabelLayout } from "./group-label-layout";

const measure = (text: string, size: number) => text.length * size * 0.55;
it("keeps labels inside their header at overview, normal and close zoom", () => {
  for (const zoom of [0.1, 0.3, 0.5, 1, 2, 4])
    for (const name of [
      "Iron Ore Extraction",
      "Reinforced Iron Plate",
      "A".repeat(160),
      "Northern steel processing and distribution facility",
    ]) {
      const layout = groupLabelLayout(
        { name, count: 8, width: 296 },
        zoom,
        measure,
      );
      for (const line of layout.text.split("\n"))
        expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(256);
      expect(
        layout.text.split("\n").length * layout.lineHeight,
      ).toBeLessThanOrEqual(44);
    }
  expect(
    groupLabelLayout({ name: "Iron Ingot", count: 8, width: 296 }, 4, measure)
      .fontSize,
  ).toBe(18);
  expect(
    groupLabelLayout({ name: "Iron Ingot", count: 8, width: 296 }, 0.1, measure)
      .visible,
  ).toBe(false);
});
it("wraps at high zoom and truncates long labels at overview scale", () => {
  expect(
    groupLabelLayout(
      { name: "Reinforced Iron Plate production", count: 3, width: 296 },
      2,
      measure,
    ).text,
  ).toContain("\n");
  expect(
    groupLabelLayout(
      { name: "Reinforced Iron Plate production", count: 3, width: 296 },
      0.4,
      measure,
    ).text,
  ).toContain("…");
});
