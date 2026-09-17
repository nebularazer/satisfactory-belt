import type { Ingredient } from "./index";

export type BuildingKind =
  | "generator"
  | "geothermal"
  | "augmenter"
  | "well"
  | "storage"
  | "depot"
  | "truck-station"
  | "train-station"
  | "freight-platform"
  | "drone-port"
  | "space-elevator";
export interface Building {
  id: string;
  descriptorId: string;
  iconId: string;
  name: string;
  description: string;
  kind: BuildingKind;
  powerMegawatts: number;
  canOverclock: boolean;
  powerConsumptionExponent: number;
  transport: "belt" | "pipe";
  capacity: number;
  fuels: {
    itemId: string;
    supplementalItemId?: string;
    supplementalPerMinute: number;
    byproduct?: Ingredient;
  }[];
  resourceIds: string[];
  /** Normal-purity extraction or generation at 100%. */
  baseRate: number;
  loadFollowing: boolean;
}

/** Project Assembly delivery requirements (game 1.2), not continuous recipes. */
export const PROJECT_PHASES: readonly (readonly Ingredient[])[] = [
  [{ itemId: "Desc_SpaceElevatorPart_1_C", amount: 50 }],
  [
    { itemId: "Desc_SpaceElevatorPart_1_C", amount: 1000 },
    { itemId: "Desc_SpaceElevatorPart_2_C", amount: 1000 },
    { itemId: "Desc_SpaceElevatorPart_3_C", amount: 100 },
  ],
  [
    { itemId: "Desc_SpaceElevatorPart_2_C", amount: 2500 },
    { itemId: "Desc_SpaceElevatorPart_4_C", amount: 500 },
    { itemId: "Desc_SpaceElevatorPart_5_C", amount: 100 },
  ],
  [
    { itemId: "Desc_SpaceElevatorPart_7_C", amount: 500 },
    { itemId: "Desc_SpaceElevatorPart_6_C", amount: 500 },
    { itemId: "Desc_SpaceElevatorPart_8_C", amount: 250 },
    { itemId: "Desc_SpaceElevatorPart_9_C", amount: 100 },
  ],
  [
    { itemId: "Desc_SpaceElevatorPart_9_C", amount: 1000 },
    { itemId: "Desc_SpaceElevatorPart_10_C", amount: 1000 },
    { itemId: "Desc_SpaceElevatorPart_11_C", amount: 200 },
    { itemId: "Desc_SpaceElevatorPart_12_C", amount: 256 },
  ],
];
