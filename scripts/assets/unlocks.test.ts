import { describe, expect, it } from "vitest";

import { parseRecipeUnlocks } from "./unlocks.ts";

function schematic(id: string, type: string, name: string, tier = "0") {
  return {
    ClassName: id,
    mType: type,
    mDisplayName: name,
    mTechTier: tier,
    mUnlocks: [] as Record<string, unknown>[],
    mSchematicDependencies: [] as Record<string, unknown>[],
  };
}
const refs = (...ids: string[]) =>
  `(${ids.map((id) => JSON.stringify(`/Game/Test.${id}`)).join(",")})`;
const grantRecipe = { Class: "BP_UnlockRecipe_C", mRecipes: refs("Recipe_C") };
function extract(...schematics: ReturnType<typeof schematic>[]) {
  return parseRecipeUnlocks(
    new Map(schematics.map((data) => [data.ClassName, { native: "FGSchematic", data }])),
    new Set(["Recipe_C"]),
  ).get("Recipe_C");
}

describe("recipe unlock extraction", () => {
  it("uses named milestone prerequisites for a Tier 0 alternate and preserves all/any requirements", () => {
    const milestone = schematic("Milestone_C", "EST_Milestone", "Control System Development", "7");
    const research = schematic("Research_C", "EST_MAM", "Quartz", "3");
    const alternate = schematic("Alternate_C", "EST_Alternate", "Alternate: Leached Iron Ingot");
    alternate.mUnlocks.push(grantRecipe);
    alternate.mSchematicDependencies.push({
      Class: "BP_SchematicPurchasedDependency_C",
      mSchematics: refs("Milestone_C", "Research_C"),
      mRequireAllSchematicsToBePurchased: "True",
    });
    expect(extract(milestone, research, alternate)).toEqual([
      {
        id: "Alternate_C",
        name: "Alternate: Leached Iron Ingot",
        kind: "hard-drive",
        requirements: [
          {
            all: true,
            schematics: [
              { id: "Milestone_C", name: milestone.mDisplayName, kind: "milestone", tier: 7 },
              { id: "Research_C", name: "Quartz", kind: "research" },
            ],
          },
        ],
      },
    ]);
    alternate.mSchematicDependencies[0]!.mRequireAllSchematicsToBePurchased = "False";
    expect(extract(milestone, research, alternate)![0]!.requirements[0]!.all).toBe(false);
  });

  it("resolves nested background grants and retains independent unlock routes without duplicates", () => {
    const milestone = schematic("Milestone_C", "EST_Milestone", "Oil Processing", "5");
    const hidden = schematic("Hidden_C", "EST_Custom", "Oil Processing 2", "5");
    const nested = schematic("Nested_C", "EST_Custom", "Internal Recipes", "5");
    const research = schematic("Research_C", "EST_MAM", "Oil Research");
    milestone.mUnlocks.push(
      { Class: "BP_UnlockSchematic_C", mSchematics: refs("Hidden_C") },
      grantRecipe,
    );
    hidden.mUnlocks.push({ Class: "BP_UnlockSchematic_C", mSchematics: refs("Nested_C") });
    nested.mUnlocks.push(grantRecipe);
    research.mUnlocks.push(grantRecipe);
    expect(extract(milestone, hidden, nested, research)).toEqual([
      { id: "Milestone_C", name: "Oil Processing", kind: "milestone", tier: 5, requirements: [] },
      { id: "Research_C", name: "Oil Research", kind: "research", requirements: [] },
    ]);
  });

  it("retains Hard Drive tier thresholds and identifies starting recipes", () => {
    const alternate = schematic("Alternate_C", "EST_Alternate", "Alternate: Iron Wire", "1");
    alternate.mUnlocks.push(grantRecipe);
    expect(extract(alternate)![0]).toMatchObject({ kind: "hard-drive", tier: 1, requirements: [] });
    const starting = schematic("Schematic_StartingRecipes_C", "EST_Custom", "Starting Blueprints");
    starting.mUnlocks.push(grantRecipe);
    expect(extract(starting)![0]).toMatchObject({ kind: "starting", requirements: [] });
  });

  it("rejects missing references and cycles rather than publishing misleading requirements", () => {
    const alternate = schematic("Alternate_C", "EST_Alternate", "Alternate: Iron Wire");
    alternate.mUnlocks.push(grantRecipe);
    alternate.mSchematicDependencies.push({
      Class: "BP_SchematicPurchasedDependency_C",
      mSchematics: refs("Missing_C"),
      mRequireAllSchematicsToBePurchased: "True",
    });
    expect(() => extract(alternate)).toThrow("Missing unlock schematic Missing_C");
    const hidden = schematic("Hidden_C", "EST_Custom", "Hidden");
    hidden.mUnlocks.push(grantRecipe, {
      Class: "BP_UnlockSchematic_C",
      mSchematics: refs("Hidden_C"),
    });
    expect(() => extract(hidden)).toThrow("Cyclic schematic unlock");
  });
});
