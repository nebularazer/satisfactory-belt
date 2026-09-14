import { describe, expect, it } from "vitest";

import { parseCatalog } from "./catalog.ts";

const group = (name: string, Classes: Record<string, unknown>[]) => ({
  NativeClass: `/Script/CoreUObject.Class'/Script/FactoryGame.${name}'`,
  Classes,
});
const source = { locale: "en-US", docsSha256: "a".repeat(64) };
const recipe = {
  ClassName: "Recipe_Test_C",
  FullName: "BlueprintGeneratedClass /Game/Recipes/AlternateRecipes/Test.Test_C",
  mDisplayName: "Test recipe",
  mManufactoringDuration: "12.000000",
  mIngredients:
    '((ItemClass="/Game/Water.Desc_Water_C",Amount=4000),(ItemClass="/Game/Iron.Desc_Iron_C",Amount=7))',
  mProduct:
    '((ItemClass="/Game/Gas.Desc_Gas_C",Amount=1000),(ItemClass="/Game/Iron.Desc_Iron_C",Amount=13))',
  mProducedIn: '("/Game/Machine.Build_Machine_C","/Game/WorkBench.BP_WorkBenchComponent_C")',
  mRelevantEvents: "(EV_Christmas)",
  mVariablePowerConsumptionConstant: "100",
  mVariablePowerConsumptionFactor: "300",
};
function fixture() {
  return [
    group("FGItemDescriptor", [
      { ClassName: "Desc_Iron_C", mDisplayName: "Iron", mDescription: "", mForm: "RF_SOLID" },
      { ClassName: "Desc_Water_C", mDisplayName: "Water", mDescription: "", mForm: "RF_LIQUID" },
      { ClassName: "Desc_Gas_C", mDisplayName: "Gas", mDescription: "", mForm: "RF_GAS" },
    ]),
    group("FGBuildingDescriptor", [{ ClassName: "Desc_Machine_C" }]),
    group("FGBuildableManufacturerVariablePower", [
      {
        ClassName: "Build_Machine_C",
        mDisplayName: "Machine",
        mDescription: "",
        mManufacturingSpeed: "1",
        mPowerConsumption: "0",
        mPowerConsumptionExponent: "1.321929",
      },
    ]),
    group("FGRecipe", [
      { ...recipe },
      {
        ...recipe,
        ClassName: "Recipe_Hand_C",
        mProducedIn: '("/Game/WorkBench.BP_WorkBenchComponent_C")',
      },
      { ...recipe, ClassName: "Recipe_Build_C", mProducedIn: '("/Game/BuildGun.BP_BuildGun_C")' },
    ]),
  ];
}
describe("manufacturing catalog", () => {
  it("normalizes fluids and gases, retains multiple outputs, events and variable power", () => {
    const { catalog, excludedRecipes } = parseCatalog(fixture(), source);
    const result = catalog.recipes.Recipe_Test_C!;
    expect(result.ingredients).toEqual([
      { itemId: "Desc_Water_C", amount: 4 },
      { itemId: "Desc_Iron_C", amount: 7 },
    ]);
    expect(result.products).toEqual([
      { itemId: "Desc_Gas_C", amount: 1 },
      { itemId: "Desc_Iron_C", amount: 13 },
    ]);
    expect(result.durationSeconds).toBe(12);
    expect(result.machineIds).toEqual(["Build_Machine_C"]);
    expect(result.alternate).toBe(true);
    expect(result.events).toEqual(["EV_Christmas"]);
    expect(result.variablePower).toEqual({ constantMegawatts: 100, factorMegawatts: 300 });
    expect(catalog.machines.Build_Machine_C!.power).toEqual({ kind: "variable" });
    expect(catalog.machines.Build_Machine_C!.iconId).toBe("Desc_Machine_C");
    expect(excludedRecipes).toEqual([
      { id: "Recipe_Build_C", reason: "building" },
      { id: "Recipe_Hand_C", reason: "handcrafting" },
    ]);
  });
  it("accepts a recipe with no ingredients", () => {
    const docs = fixture();
    docs[3]!.Classes[0]!.mIngredients = "";
    expect(parseCatalog(docs, source).catalog.recipes.Recipe_Test_C!.ingredients).toEqual([]);
  });
  it("rejects unresolved items, unfamiliar producers and malformed numeric fields", () => {
    for (const [field, value] of [
      ["mProduct", '((ItemClass="/Game/Missing.Desc_Missing_C",Amount=1))'],
      ["mProducedIn", '("/Game/Machine.Build_Unknown_C")'],
      ["mManufactoringDuration", "12 seconds"],
    ]) {
      const docs = fixture();
      docs[3]!.Classes[0]![field!] = value;
      expect(() => parseCatalog(docs, source)).toThrow();
    }
  });
  it("rejects duplicate classes and missing machine descriptors", () => {
    const docs = fixture();
    docs[0]!.Classes.push(docs[0]!.Classes[0]!);
    expect(() => parseCatalog(docs, source)).toThrow("duplicate class");
    const missing = fixture();
    missing[1]!.Classes = [];
    expect(() => parseCatalog(missing, source)).toThrow("Missing building descriptor");
  });
});
