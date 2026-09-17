import { expect, it } from "vitest";

import { sortInspectorOptions } from "./inspector-options";

it("sorts item names alphabetically without mutating exported catalog order", () => {
  const options = [
    "Computer",
    "Supercomputer",
    "Copper Powder",
    "Copper Ingot",
    "Blue Power Slug",
  ].map((label) => ({ value: label, label }));
  expect(sortInspectorOptions(options).map((option) => option.label)).toEqual([
    "Blue Power Slug",
    "Computer",
    "Copper Ingot",
    "Copper Powder",
    "Supercomputer",
  ]);
  expect(options[0]!.label).toBe("Computer");
});

it("keeps utility choices in their declared order before alphabetic items", () => {
  const options = [
    { value: "any", label: "Any", pinned: true },
    { value: "none", label: "None", pinned: true },
    { value: "overflow", label: "Overflow", pinned: true },
    { value: "copper", label: "Copper" },
    { value: "aluminum", label: "Aluminum" },
  ];
  expect(sortInspectorOptions(options).map((option) => option.value)).toEqual([
    "any",
    "none",
    "overflow",
    "aluminum",
    "copper",
  ]);
});

it("keeps numbered tiers in natural order", () => {
  const options = [10, 2, 1].map((tier) => ({ value: String(tier), label: `Mk.${tier}` }));
  expect(sortInspectorOptions(options).map((option) => option.value)).toEqual(["1", "2", "10"]);
});
