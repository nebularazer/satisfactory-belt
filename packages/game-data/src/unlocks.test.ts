import { expect, it } from "vitest";

import { recipeUnlockDescription } from "./unlocks";
import type { RecipeUnlock } from "./unlocks";

const alternate: RecipeUnlock = {
  id: "Alternate_C",
  name: "Alternate: Leached Iron Ingot",
  kind: "hard-drive",
  requirements: [
    {
      all: true,
      schematics: [
        { id: "Milestone_C", name: "Control System Development", kind: "milestone", tier: 7 },
      ],
    },
  ],
};

it("distinguishes Hard Drive research from its milestone prerequisite", () => {
  expect(recipeUnlockDescription(alternate, alternate.name)).toEqual({
    method: "Hard Drive research",
    prerequisites: ["Requires Tier 7 · Control System Development"],
  });
});

it("keeps all/any prerequisite semantics and includes MAM names", () => {
  const requirement: RecipeUnlock["requirements"][number] = {
    all: true,
    schematics: [
      { id: "Milestone_C", name: "Control System Development", kind: "milestone", tier: 7 },
      { id: "Research_C", name: "Quartz", kind: "research" },
    ],
  };
  const unlock = { ...alternate, requirements: [requirement] };
  expect(recipeUnlockDescription(unlock, unlock.name).prerequisites).toEqual([
    "Requires Tier 7 · Control System Development and MAM · Quartz",
  ]);
  requirement.all = false;
  expect(recipeUnlockDescription(unlock, unlock.name).prerequisites).toEqual([
    "Requires Tier 7 · Control System Development or MAM · Quartz",
  ]);
});

it("shows the tier threshold when no named milestone is required and identifies a different granting alternate", () => {
  const unlock = { ...alternate, name: "Alternate: Iron Wire", tier: 1, requirements: [] };
  expect(recipeUnlockDescription(unlock, unlock.name).method).toBe("Hard Drive research · Tier 1");
  expect(
    recipeUnlockDescription(
      { ...unlock, name: "Alternate: Quartz Purification" },
      "Alternate: Distilled Silica",
    ).method,
  ).toBe("Hard Drive research · Quartz Purification · Tier 1");
});
