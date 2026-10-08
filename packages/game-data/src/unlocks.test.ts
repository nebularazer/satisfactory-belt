import { expect, it } from "vitest";

import { recipeUnlockRequirements } from "./unlocks";
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

it("omits implicit Hard Drive research and lists its milestone prerequisite", () => {
  expect(recipeUnlockRequirements(alternate, alternate.name)).toEqual([
    "Tier 7 - Control System Development",
  ]);
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
  expect(recipeUnlockRequirements(unlock, unlock.name)).toEqual([
    "Tier 7 - Control System Development",
    "MAM - Quartz",
  ]);
  requirement.all = false;
  expect(recipeUnlockRequirements(unlock, unlock.name)).toEqual([
    "Tier 7 - Control System Development or MAM - Quartz",
  ]);
});

it("shows the tier threshold when no named milestone is required and identifies a different granting alternate", () => {
  const unlock = { ...alternate, name: "Alternate: Iron Wire", tier: 1, requirements: [] };
  expect(recipeUnlockRequirements(unlock, unlock.name)).toEqual(["Tier 1"]);
  expect(
    recipeUnlockRequirements(
      { ...unlock, name: "Alternate: Quartz Purification" },
      "Alternate: Distilled Silica",
    ),
  ).toEqual(["Alternate - Quartz Purification", "Tier 1"]);
});

it("does not invent a requirement for an alternate with no prerequisite metadata", () => {
  expect(recipeUnlockRequirements({ ...alternate, requirements: [] }, alternate.name)).toEqual([]);
});
