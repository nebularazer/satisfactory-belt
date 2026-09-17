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
        mCanChangePotential: "True",
        mCanChangeProductionBoost: "True",
        mOverrideProductionShardSlotSize: "True",
        mProductionShardSlotSize: "2",
        mBaseProductionBoost: "1",
        mProductionShardBoostMultiplier: "0.5",
        mProductionBoostPowerConsumptionExponent: "2",
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
  it.each(["Splitter", "Merger"])(
    "extracts %s imagery and kind independently of translated names",
    (part) => {
      const docs = fixture();
      docs[1]!.Classes.push({ ClassName: `Desc_${part}_C` });
      docs.push(
        group(`FGBuildableAttachment${part}`, [
          { ClassName: `Build_${part}_C`, mDisplayName: "Translated part", mDescription: "" },
        ]),
      );
      const { catalog } = parseCatalog(docs, source);
      expect(catalog.logistics[`Build_${part}_C`]).toEqual({
        id: `Build_${part}_C`,
        descriptorId: `Desc_${part}_C`,
        iconId: `Desc_${part}_C`,
        name: "Translated part",
        description: "",
        kind: part.toLowerCase(),
      });
      docs[1]!.Classes.pop();
      expect(() => parseCatalog(docs, source)).toThrow("Missing building descriptor");
    },
  );
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
  it("adds the Gift Tree as an event-restricted fixed producer, independent of translated names", () => {
    const docs = fixture();
    docs[0]!.Classes.push({
      ClassName: "Desc_Gift_C",
      mDisplayName: "Geschenk",
      mDescription: "",
      mForm: "RF_SOLID",
    });
    docs[1]!.Classes.push({ ClassName: "Desc_TreeGiftProducer_C" });
    docs.push(
      group("FGBuildableFactorySimpleProducer", [
        {
          ClassName: "Build_TreeGiftProducer_C",
          mDisplayName: "Geschenkbaum",
          mDescription: "",
          mTimeToProduceItem: "4.000000",
          mPowerConsumption: "0.000000",
          mCanChangePotential: "False",
          mEventType: "EV_Christmas",
        },
      ]),
    );
    const { catalog } = parseCatalog(docs, source);
    const tree = catalog.fixedProducers.Build_TreeGiftProducer_C!;
    expect(tree.products).toEqual([{ itemId: "Desc_Gift_C", amount: 1 }]);
    expect(60 / tree.durationSeconds).toBe(15);
    expect(tree.powerMegawatts).toBe(0);
    expect(tree.canOverclock).toBe(false);
    expect(tree.events).toEqual(["EV_Christmas"]);
    expect(tree.iconId).toBe("Desc_TreeGiftProducer_C");
    expect(catalog.machines.Build_TreeGiftProducer_C).toBeUndefined();
    docs[0]!.Classes = docs[0]!.Classes.filter((entry) => entry.ClassName !== "Desc_Gift_C");
    expect(() => parseCatalog(docs, source)).toThrow("Missing Gift Tree descriptor or gift item");
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

it.each([
  ["True", "True", "2", 2],
  ["True", "False", "0", 1],
  ["True", "True", "4", 4],
  ["False", "False", "0", 0],
])(
  "extracts Sloop capacity with capability=%s override=%s size=%s",
  (capable, override, size, expected) => {
    const docs = fixture();
    Object.assign(docs[2]!.Classes[0]!, {
      mCanChangeProductionBoost: capable,
      mOverrideProductionShardSlotSize: override,
      mProductionShardSlotSize: size,
      mCanChangePotential: "False",
    });
    const machine = parseCatalog(docs, source).catalog.machines.Build_Machine_C!;
    expect(machine.sloopSlots).toBe(expected);
    expect(machine.canOverclock).toBe(false);
    expect(machine.productionBoost).toEqual({ base: 1, perSloop: 0.5, powerExponent: 2 });
  },
);
it.each(["-1", "0", "1.5", "5"])("rejects invalid Sloop slot overrides %s", (size) => {
  const docs = fixture();
  docs[2]!.Classes[0]!.mProductionShardSlotSize = size;
  expect(() => parseCatalog(docs, source)).toThrow("Invalid Sloop slots");
});

function extractorDocs() {
  const docs = fixture();
  docs[0]!.NativeClass = group("FGResourceDescriptor", []).NativeClass;
  docs.push(
    group("FGItemDescriptor", [
      { ClassName: "Desc_Ingot_C", mDisplayName: "Ingot", mDescription: "", mForm: "RF_SOLID" },
    ]),
  );
  docs[0]!.Classes.push({
    ClassName: "Desc_Oil_C",
    mDisplayName: "Oil",
    mDescription: "",
    mForm: "RF_LIQUID",
  });
  docs[1]!.Classes.push(
    ...["Miner", "WaterPump", "OilPump"].map((name) => ({ ClassName: `Desc_${name}_C` })),
  );
  const base = {
    mDisplayName: "Extractor",
    mDescription: "",
    mPowerConsumption: "5",
    mPowerConsumptionExponent: "1.321929",
    mCanChangePotential: "True",
    mAllowedResourceForms: "(RF_SOLID)",
    mOnlyAllowCertainResources: "False",
    mAllowedResources: "",
  };
  docs.push(
    group("FGBuildableResourceExtractor", [
      { ...base, ClassName: "Build_Miner_C" },
      {
        ...base,
        ClassName: "Build_OilPump_C",
        mPowerConsumption: "40",
        mAllowedResourceForms: "(RF_LIQUID)",
        mOnlyAllowCertainResources: "True",
        mAllowedResources: '("/Game/Oil.Desc_Oil_C")',
      },
    ]),
  );
  docs.push(
    group("FGBuildableWaterPump", [
      {
        ...base,
        ClassName: "Build_WaterPump_C",
        mPowerConsumption: "20",
        mAllowedResourceForms: "(RF_LIQUID)",
        mOnlyAllowCertainResources: "True",
        mAllowedResources: '("/Game/Water.Desc_Water_C")',
      },
    ]),
  );
  return docs;
}

it("extracts miner, water and oil capabilities from resource forms and restrictions", () => {
  const { catalog } = parseCatalog(extractorDocs(), source);
  expect(catalog.extractors.Build_Miner_C).toMatchObject({
    resourceIds: ["Desc_Iron_C"],
    iconId: "Desc_Miner_C",
    powerMegawatts: 5,
    canOverclock: true,
  });
  expect(catalog.extractors.Build_WaterPump_C).toMatchObject({
    resourceIds: ["Desc_Water_C"],
    powerMegawatts: 20,
  });
  expect(catalog.extractors.Build_OilPump_C).toMatchObject({
    resourceIds: ["Desc_Oil_C"],
    powerMegawatts: 40,
  });
  expect(catalog.machines.Build_Miner_C).toBeUndefined();
});

it("rejects extractor restrictions that point to manufactured items or incompatible forms", () => {
  for (const resource of ["Desc_Ingot_C", "Desc_Iron_C", "Desc_Missing_C"]) {
    const docs = extractorDocs();
    docs.at(-1)!.Classes[0]!.mAllowedResources = `("/Game/Resource.${resource}")`;
    expect(() => parseCatalog(docs, source)).toThrow("Invalid resource restriction");
  }
});

it("extracts the AWESOME Sink without manufacturing recipes or translated-name matching", () => {
  const docs = fixture();
  docs[1]!.Classes.push({ ClassName: "Desc_ResourceSink_C" });
  docs.push(
    group("FGBuildableResourceSink", [
      {
        ClassName: "Build_ResourceSink_C",
        mDisplayName: "Translated sink",
        mDescription: "Consumes parts",
        mPowerConsumption: "30.000000",
      },
    ]),
  );
  const { catalog } = parseCatalog(docs, source);
  expect(catalog.sinks.Build_ResourceSink_C).toEqual({
    id: "Build_ResourceSink_C",
    descriptorId: "Desc_ResourceSink_C",
    iconId: "Desc_ResourceSink_C",
    name: "Translated sink",
    description: "Consumes parts",
    powerMegawatts: 30,
  });
  expect(catalog.machines.Build_ResourceSink_C).toBeUndefined();
  docs[1]!.Classes.pop();
  expect(() => parseCatalog(docs, source)).toThrow("Missing building descriptor");
});

it.each([
  [3, "smart-splitter"],
  [64, "programmable-splitter"],
] as const)("extracts configurable splitter kind from its %s-rule capability", (limit, kind) => {
  const docs = fixture();
  docs[1]!.Classes.push({ ClassName: "Desc_Advanced_C" });
  docs.push(
    group("FGBuildableSplitterSmart", [
      {
        ClassName: "Build_Advanced_C",
        mDisplayName: "Translated splitter",
        mDescription: "",
        mMaxNumSortRules: String(limit),
      },
    ]),
  );
  expect(parseCatalog(docs, source).catalog.logistics.Build_Advanced_C).toMatchObject({
    kind,
    descriptorId: "Desc_Advanced_C",
  });
});

it("extracts continuous sinkability including DNA's separate points counter", () => {
  const docs = fixture();
  docs[0]!.Classes.push(
    {
      ClassName: "Desc_Plate_C",
      mDisplayName: "Plate",
      mDescription: "",
      mForm: "RF_SOLID",
      mResourceSinkPoints: "6",
    },
    {
      ClassName: "Desc_AlienDNACapsule_C",
      mDisplayName: "DNA",
      mDescription: "",
      mForm: "RF_SOLID",
      mResourceSinkPoints: "0",
    },
    {
      ClassName: "Desc_Waste_C",
      mDisplayName: "Waste",
      mDescription: "",
      mForm: "RF_SOLID",
      mResourceSinkPoints: "0",
    },
    {
      ClassName: "Desc_ResourceSinkCoupon_C",
      mDisplayName: "Coupon",
      mDescription: "",
      mForm: "RF_SOLID",
      mResourceSinkPoints: "1",
    },
  );
  const { items } = parseCatalog(docs, source).catalog;
  expect(items.Desc_Plate_C!.sinkable).toBe(true);
  expect(items.Desc_AlienDNACapsule_C!.sinkable).toBe(true);
  expect(items.Desc_Waste_C!.sinkable).toBe(false);
  expect(items.Desc_ResourceSinkCoupon_C!.sinkable).toBe(false);
  expect(items.Desc_Water_C!.sinkable).toBe(false);
});

it("extracts generator fuel energy, supplemental water and nuclear waste without treating them as recipes", () => {
  const docs = fixture();
  docs[0]!.Classes.push({
    ClassName: "Desc_Rod_C",
    mDisplayName: "Rod",
    mDescription: "",
    mForm: "RF_SOLID",
    mEnergyValue: "750000",
    mStackSize: "SS_SMALL",
  });
  docs[1]!.Classes.push({ ClassName: "Desc_Reactor_C" });
  docs.push(
    group("FGBuildableGeneratorNuclear", [
      {
        ClassName: "Build_Reactor_C",
        mDisplayName: "Reactor",
        mDescription: "",
        mPowerProduction: "2500",
        mPowerConsumptionExponent: "1.6",
        mCanChangePotential: "True",
        mSupplementalToPowerRatio: "1.6",
        mFuel: [
          {
            mFuelClass: "Desc_Rod_C",
            mSupplementalResourceClass: "Desc_Water_C",
            mByproduct: "Desc_Iron_C",
            mByproductAmount: "50",
          },
        ],
      },
    ]),
  );
  const { catalog } = parseCatalog(docs, source);
  expect(catalog.items.Desc_Rod_C).toMatchObject({ energyMegajoules: 750000, stackSize: 50 });
  expect(catalog.buildings!.Build_Reactor_C).toMatchObject({
    kind: "generator",
    powerMegawatts: 2500,
    fuels: [
      {
        itemId: "Desc_Rod_C",
        supplementalItemId: "Desc_Water_C",
        supplementalPerMinute: 240,
        byproduct: { itemId: "Desc_Iron_C", amount: 50 },
      },
    ],
  });
  expect(catalog.machines.Build_Reactor_C).toBeUndefined();
});

it("normalizes liquid fuel energy to cubic metres and separates DNA from regular Sink points", () => {
  const docs = fixture();
  docs[0]!.Classes.push(
    {
      ClassName: "Desc_Fuel_C",
      mDisplayName: "Fuel",
      mDescription: "",
      mForm: "RF_LIQUID",
      mEnergyValue: "0.75",
      mResourceSinkPoints: "0",
    },
    {
      ClassName: "Desc_AlienDNACapsule_C",
      mDisplayName: "DNA",
      mDescription: "",
      mForm: "RF_SOLID",
      mResourceSinkPoints: "0",
    },
  );
  const { catalog } = parseCatalog(docs, source);
  expect(catalog.items.Desc_Fuel_C).toMatchObject({
    energyMegajoules: 750,
    unit: "m3",
    sinkable: false,
  });
  expect(catalog.items.Desc_AlienDNACapsule_C).toMatchObject({
    dnaPoints: 1000,
    sinkPoints: 0,
    sinkable: true,
  });
});

it("keeps fluid-buffer capacities in cubic metres and excludes power storage/grid buildables", () => {
  const docs = fixture();
  docs[1]!.Classes.push({ ClassName: "Desc_Buffer_C" }, { ClassName: "Desc_PowerStorage_C" });
  docs.push(
    group("FGBuildablePipeReservoir", [
      {
        ClassName: "Build_Buffer_C",
        mDisplayName: "Buffer",
        mDescription: "",
        mStorageCapacity: "400",
      },
    ]),
    group("FGBuildablePowerStorage", [
      { ClassName: "Build_PowerStorage_C", mDisplayName: "Battery" },
    ]),
  );
  const { catalog } = parseCatalog(docs, source);
  expect(catalog.buildings!.Build_Buffer_C).toMatchObject({
    kind: "storage",
    capacity: 400,
    transport: "pipe",
  });
  expect(catalog.buildings!.Build_PowerStorage_C).toBeUndefined();
});

it("does not expose inherited clock controls on Alien Power Augmenters", () => {
  const docs = fixture();
  docs[1]!.Classes.push({ ClassName: "Desc_Augmenter_C" });
  docs.push(
    group("FGBuildablePowerBooster", [
      {
        ClassName: "Build_Augmenter_C",
        mDisplayName: "Alien Power Augmenter",
        mDescription: "",
        mBasePowerProduction: "500",
        mCanChangePotential: "True",
      },
    ]),
  );
  expect(parseCatalog(docs, source).catalog.buildings!.Build_Augmenter_C).toMatchObject({
    kind: "augmenter",
    canOverclock: false,
    powerMegawatts: 500,
  });
});
