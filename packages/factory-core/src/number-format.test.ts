import { expect, it } from "vitest";

import { formatPlanningNumber } from "./number-format";

it.each([
  [500 / 3, "166⅔"],
  [250 / 3, "83⅓"],
  [166.666666667, "166⅔"],
  [166.67, "166.67"],
  [2000 / 13, "153.85"],
  [62.5, "62½"],
  [1.2, "1.2"],
  [1200.25, "1,200¼"],
  [1 / 3, "⅓"],
  [-1 / 3, "−⅓"],
  [99.999999999, "100"],
  [100, "100"],
  [-0.00000001, "0"],
])("formats %s without unnecessary precision: %s", (value, expected) => {
  expect(formatPlanningNumber(value)).toBe(expected);
});

it.each([
  [200 / 3, "66 2/3"],
  [250 / 3, "83 1/3"],
  [1 / 8, "1/8"],
  [2000 / 13, "153.85"],
  [100, "100"],
])("formats %s as a mixed number when possible", (value, expected) => {
  expect(formatPlanningNumber(value, "mixed")).toBe(expected);
});
