import { GRID_SIZE } from "@satisfactory-belt/canvas-core";
import { createFactoryNode, createMachineMembers } from "@satisfactory-belt/factory-core";
import type {
  FactoryDocument,
  FactoryNode,
  NodeConfiguration,
  TransportRoute,
} from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

const showcaseId = (id: string) => `inspector-${id}`;

/** A separate, editable gallery to the right of the original canvas examples. */
export function createInspectorShowcase(catalog: GameCatalog): FactoryDocument {
  const nodes: FactoryNode[] = [];
  const recipes = Object.values(catalog.recipes);
  let row = 0;
  let platformPosition = 0;

  function addSection(entries: readonly { id: string; configuration: NodeConfiguration }[]) {
    entries.forEach(({ id, configuration }, index) => {
      let node = createFactoryNode(catalog, configuration, showcaseId(id), {
        x: (55 + (index % 6) * 14) * GRID_SIZE,
        y: (5 + (row + Math.floor(index / 6)) * 14) * GRID_SIZE,
      });
      if (node.kind === "manufacturing" && node.machineId === "Build_AssemblerMk1_C")
        node = {
          ...node,
          machines: createMachineMembers(3).map((member, i) => ({
            id: member.id,
            clockPercent: [50, 100, 150][i]!,
            sloopsUsed: i === 0 ? 0 : 1,
          })),
        };
      if (node.kind === "facility") {
        const c = node.configuration;
        const building = catalog.buildings![node.buildingId]!;
        if (c.type === "well")
          node = {
            ...node,
            configuration: {
              ...c,
              resourceId: "Desc_NitrogenGas_C",
            },
          };
        if (c.type === "truck-station")
          node = {
            ...node,
            configuration: {
              ...c,
              materialId: building.transport === "belt" ? "Desc_IronPlate_C" : "Desc_Water_C",
              routeId: showcaseId("road-route"),
            },
          };
        if (c.type === "train-station")
          node = { ...node, configuration: { ...c, routeId: showcaseId("rail-route") } };
        if (c.type === "freight-platform")
          node = {
            ...node,
            configuration: {
              ...c,
              stationId: showcaseId("Build_TrainStation_C"),
              position: 2 + ++platformPosition,
              materialId: node.buildingId.includes("Empty")
                ? null
                : building.transport === "belt"
                  ? "Desc_IronPlate_C"
                  : "Desc_Water_C",
            },
          };
        if (c.type === "drone-port")
          node = {
            ...node,
            configuration: {
              ...c,
              outgoingItemId: "Desc_IronPlate_C",
              incomingItemId: "Desc_OreIron_C",
            },
          };
      }
      nodes.push(node);
    });
    row += Math.ceil(entries.length / 6);
  }

  // Connected examples occupy the first row, keeping their links short and easy to select.
  addSection([
    {
      id: "Build_ConstructorMk1_C",
      configuration: {
        kind: "manufacturing",
        machineId: "Build_ConstructorMk1_C",
        recipeId: "Recipe_IronPlate_C",
      },
    },
    {
      id: "Build_StorageContainerMk1_C",
      configuration: { kind: "facility", buildingId: "Build_StorageContainerMk1_C" },
    },
    {
      id: "Build_ResourceSink_C",
      configuration: { kind: "sink", sinkId: "Build_ResourceSink_C" },
    },
    {
      id: "Build_WaterPump_C",
      configuration: {
        kind: "extractor",
        extractorId: "Build_WaterPump_C",
        resourceId: "Desc_Water_C",
      },
    },
    {
      id: "Build_PipeStorageTank_C",
      configuration: { kind: "facility", buildingId: "Build_PipeStorageTank_C" },
    },
  ]);
  addSection(
    Object.values(catalog.machines)
      .filter((machine) => machine.id !== "Build_ConstructorMk1_C")
      .map((machine) => {
        const recipe = recipes.find(
          (r) => r.machineIds.includes(machine.id) && !r.alternate && !r.events.length,
        );
        if (!recipe) throw new Error(`Missing showcase recipe for ${machine.name}.`);
        return {
          id: machine.id,
          configuration: {
            kind: "manufacturing",
            machineId: machine.id,
            recipeId: recipe.id,
          },
        };
      }),
  );
  addSection([
    ...Object.values(catalog.extractors)
      .filter((extractor) => extractor.id !== "Build_WaterPump_C")
      .map((extractor) => ({
        id: extractor.id,
        configuration: {
          kind: "extractor" as const,
          extractorId: extractor.id,
          resourceId: extractor.resourceIds.includes("Desc_OreIron_C")
            ? "Desc_OreIron_C"
            : extractor.resourceIds[0]!,
        },
      })),
    ...Object.values(catalog.fixedProducers).map((producer) => ({
      id: producer.id,
      configuration: { kind: "fixed-producer" as const, producerId: producer.id },
    })),
  ]);
  addSection(
    Object.values(catalog.logistics).map((part) => ({
      id: part.id,
      configuration: { kind: "logistics", partId: part.id },
    })),
  );
  const buildings = Object.values(catalog.buildings ?? {});
  for (const kinds of [
    ["generator", "augmenter"],
    ["well", "storage", "depot"],
    ["truck-station", "train-station", "drone-port"],
    ["freight-platform", "space-elevator"],
  ])
    addSection(
      buildings
        .filter(
          (building) =>
            kinds.includes(building.kind) && !nodes.some((n) => n.id === showcaseId(building.id)),
        )
        .map((building) => ({
          id: building.id,
          configuration: { kind: "facility", buildingId: building.id },
        })),
    );

  const routes: TransportRoute[] = (["road", "rail"] as const).map((kind) => ({
    id: showcaseId(`${kind}-route`),
    name: kind === "road" ? "Inspector vehicle route" : "Inspector train route",
    kind,
    vehicleCount: 1,
    freightCarCount: kind === "rail" ? 4 : undefined,
    roundTripSeconds: 120,
    fuelId: kind === "road" ? "Desc_Coal_C" : null,
    fuelPerTrip: kind === "road" ? 4 : 0,
    stops: nodes
      .filter(
        (node) =>
          node.kind === "facility" &&
          node.configuration.type === (kind === "road" ? "truck-station" : "train-station"),
      )
      .map((node) => ({
        id: `${node.id}-stop`,
        nodeId: node.id,
        loadItemIds: [],
        unloadItemIds: [],
        waitSeconds: 15,
      })),
  }));
  return {
    nodes,
    routes,
    links: [
      {
        id: showcaseId("road-out"),
        output: { nodeId: showcaseId("Build_TruckStation_C"), portKey: "route:output" },
        input: { nodeId: showcaseId("Build_FluidTruckStation_C"), portKey: "route:input" },
      },
      {
        id: showcaseId("road-return"),
        output: { nodeId: showcaseId("Build_FluidTruckStation_C"), portKey: "route:output" },
        input: { nodeId: showcaseId("Build_TruckStation_C"), portKey: "route:input" },
      },
      {
        id: showcaseId("platform-1"),
        output: { nodeId: showcaseId("Build_TrainStation_C"), portKey: "platform:output" },
        input: { nodeId: showcaseId("Build_TrainDockingStation_C"), portKey: "platform:input" },
      },
      {
        id: showcaseId("platform-2"),
        output: { nodeId: showcaseId("Build_TrainStation_C"), portKey: "platform:output" },
        input: {
          nodeId: showcaseId("Build_TrainDockingStationLiquid_C"),
          portKey: "platform:input",
        },
      },
      {
        id: showcaseId("belt"),
        output: {
          nodeId: showcaseId("Build_ConstructorMk1_C"),
          portKey: "output:Desc_IronPlate_C",
        },
        input: { nodeId: showcaseId("Build_StorageContainerMk1_C"), portKey: "input:0" },
        tier: 1,
      },
      {
        id: showcaseId("sink-belt"),
        output: { nodeId: showcaseId("Build_StorageContainerMk1_C"), portKey: "output:0" },
        input: { nodeId: showcaseId("Build_ResourceSink_C"), portKey: "input:0" },
        tier: 2,
      },
      {
        id: showcaseId("pipe"),
        output: { nodeId: showcaseId("Build_WaterPump_C"), portKey: "output:Desc_Water_C" },
        input: { nodeId: showcaseId("Build_PipeStorageTank_C"), portKey: "input:0" },
        tier: 2,
      },
    ],
  };
}
