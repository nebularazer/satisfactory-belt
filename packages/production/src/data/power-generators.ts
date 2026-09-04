import type { PowerGenerator } from "../types";

const GENERATOR_CLOCK_SPEED = {
  maximumPercent: 250,
  minimumPercent: 1,
} as const;

export const POWER_GENERATORS: readonly PowerGenerator[] = [
  {
    category: "power",
    clockSpeed: GENERATOR_CLOCK_SPEED,
    fuels: [
      { itemId: "Desc_Leaves_C" },
      { itemId: "Desc_Wood_C" },
      { itemId: "Desc_Mycelia_C" },
      { itemId: "Desc_GenericBiomass_C" },
      { itemId: "Desc_Biofuel_C" },
      { itemId: "Desc_PackagedBiofuel_C" },
    ],
    generatorKind: "fuel",
    id: "Build_GeneratorBiomass_Automated_C",
    name: "Biomass Burner",
    powerProductionMw: 30,
  },
  {
    category: "power",
    clockSpeed: GENERATOR_CLOCK_SPEED,
    fuels: ["Desc_Coal_C", "Desc_CompactedCoal_C", "Desc_PetroleumCoke_C"].map(
      (itemId) => ({
        itemId,
        supplemental: { itemId: "Desc_Water_C", ratePerMinute: 45 },
      }),
    ),
    generatorKind: "fuel",
    id: "Build_GeneratorCoal_C",
    name: "Coal-Powered Generator",
    powerProductionMw: 75,
  },
  {
    category: "power",
    clockSpeed: GENERATOR_CLOCK_SPEED,
    fuels: [
      "Desc_LiquidFuel_C",
      "Desc_LiquidTurboFuel_C",
      "Desc_LiquidBiofuel_C",
      "Desc_RocketFuel_C",
      "Desc_IonizedFuel_C",
    ].map((itemId) => ({ itemId })),
    generatorKind: "fuel",
    id: "Build_GeneratorFuel_C",
    name: "Fuel-Powered Generator",
    powerProductionMw: 250,
  },
  {
    category: "power",
    clockSpeed: GENERATOR_CLOCK_SPEED,
    fuels: [
      {
        byproduct: { amountPerFuel: 50, itemId: "Desc_NuclearWaste_C" },
        itemId: "Desc_NuclearFuelRod_C",
        supplemental: { itemId: "Desc_Water_C", ratePerMinute: 240 },
      },
      {
        byproduct: { amountPerFuel: 10, itemId: "Desc_PlutoniumWaste_C" },
        itemId: "Desc_PlutoniumFuelRod_C",
        supplemental: { itemId: "Desc_Water_C", ratePerMinute: 240 },
      },
      {
        itemId: "Desc_FicsoniumFuelRod_C",
        supplemental: { itemId: "Desc_Water_C", ratePerMinute: 240 },
      },
    ],
    generatorKind: "fuel",
    id: "Build_GeneratorNuclear_C",
    name: "Nuclear Power Plant",
    powerProductionMw: 2500,
  },
  {
    category: "power",
    generatorKind: "geothermal",
    id: "Build_GeneratorGeoThermal_C",
    name: "Geothermal Generator",
    powerProductionByPurity: {
      impure: { maximumMw: 150, minimumMw: 50 },
      normal: { maximumMw: 300, minimumMw: 100 },
      pure: { maximumMw: 600, minimumMw: 200 },
    },
  },
];
