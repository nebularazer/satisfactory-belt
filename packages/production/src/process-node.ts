import {
  findProductionMachine,
  findRecipe,
  findResourceExtractor,
} from "./catalog";
import { findProductionProcess } from "./production-process";
import type {
  ClockedBuildable,
  ExtractorInstanceConfiguration,
  ExtractionProcessNode,
  MaterialRate,
  ProcessInstanceRequest,
  ProcessNode,
  ProcessNodeRequest,
  RecipeProcessNode,
  ResourcePurity,
} from "./types";

const RESOURCE_PURITY_MULTIPLIER: Readonly<Record<ResourcePurity, number>> = {
  impure: 0.5,
  normal: 1,
  pure: 2,
};

export class ProcessNodeConfigurationError extends Error {
  override readonly name = "ProcessNodeConfigurationError";
}

function invalid(message: string): never {
  throw new ProcessNodeConfigurationError(message);
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function requireId(value: string, label: string) {
  if (value.trim().length === 0) invalid(`${label} must not be empty.`);
}

function requestedInstances(request: ProcessNodeRequest) {
  if (request.instances === undefined) {
    return [{ id: `${request.id}:instance-1` }] as const;
  }
  if (request.instances.length === 0) {
    invalid("A Process Node must contain at least one machine instance.");
  }

  const ids = new Set<string>();
  for (const instance of request.instances) {
    requireId(instance.id, "Machine instance id");
    if (ids.has(instance.id)) {
      invalid(`Machine instance id ${instance.id} is duplicated.`);
    }
    ids.add(instance.id);
  }
  return request.instances;
}

function clockSpeedPercentFor(
  instance: ProcessInstanceRequest,
  buildable: ClockedBuildable,
) {
  const clockSpeedPercent = instance.clockSpeedPercent ?? 100;
  if (
    !Number.isFinite(clockSpeedPercent) ||
    clockSpeedPercent < buildable.clockSpeed.minimumPercent ||
    clockSpeedPercent > buildable.clockSpeed.maximumPercent
  ) {
    invalid(
      `${buildable.name} Clock Speed must be between ${buildable.clockSpeed.minimumPercent}% and ${buildable.clockSpeed.maximumPercent}%.`,
    );
  }
  return clockSpeedPercent;
}

function aggregateMaterialRates(materials: readonly MaterialRate[]) {
  const rates = new Map<string, number>();
  for (const material of materials) {
    rates.set(
      material.itemId,
      (rates.get(material.itemId) ?? 0) + material.ratePerMinute,
    );
  }
  return [...rates].map(([itemId, ratePerMinute]) => ({
    itemId,
    ratePerMinute: round(ratePerMinute),
  }));
}

function emptyPowerProduction() {
  return { maximumMw: 0, minimumMw: 0 } as const;
}

function createRecipeNode(
  request: ProcessNodeRequest,
  instances: readonly ProcessInstanceRequest[],
): RecipeProcessNode {
  const process = findProductionProcess(request.processId);
  if (process?.kind !== "recipe") {
    invalid(`Recipe Production Process ${request.processId} does not exist.`);
  }
  const machine = findProductionMachine(request.buildableId);
  if (!machine) {
    invalid(`Production Machine ${request.buildableId} does not exist.`);
  }
  if (!process.buildableIds.includes(machine.id)) {
    invalid(`${machine.name} cannot perform ${process.name}.`);
  }
  const recipe = findRecipe(process.recipeId);
  if (!recipe) invalid(`Recipe ${process.recipeId} does not exist.`);

  const configurations = instances.map((instance) => {
    if (instance.resourcePurity !== undefined) {
      invalid("Recipe machine instances cannot have a Resource Purity.");
    }
    const somersloopCount = instance.somersloopCount ?? 0;
    const amplification = machine.productionAmplification;
    const maximumSomersloops = amplification?.somersloopSlots ?? 0;
    if (
      !Number.isInteger(somersloopCount) ||
      somersloopCount < 0 ||
      somersloopCount > maximumSomersloops
    ) {
      invalid(
        `${machine.name} Somersloop count must be a whole number between 0 and ${maximumSomersloops}.`,
      );
    }
    return {
      clockSpeedPercent: clockSpeedPercentFor(instance, machine),
      id: instance.id,
      somersloopCount,
    };
  });

  const amplificationFor = (somersloopCount: number) =>
    1 +
    somersloopCount *
      (machine.productionAmplification?.multiplierPerSomersloop ?? 0);
  const inputs = aggregateMaterialRates(
    configurations.flatMap(({ clockSpeedPercent }) =>
      recipe.inputs.map(({ itemId, ratePerMinute }) => ({
        itemId,
        ratePerMinute: ratePerMinute * (clockSpeedPercent / 100),
      })),
    ),
  );
  const outputs = aggregateMaterialRates(
    configurations.flatMap(({ clockSpeedPercent, somersloopCount }) =>
      recipe.outputs.map(({ itemId, ratePerMinute }) => ({
        itemId,
        ratePerMinute:
          ratePerMinute *
          (clockSpeedPercent / 100) *
          amplificationFor(somersloopCount),
      })),
    ),
  );
  const nominalPower = recipe.power ?? {
    maximumMw: machine.basePowerMw,
    minimumMw: machine.basePowerMw,
  };
  const consumed = configurations.reduce(
    (total, { clockSpeedPercent, somersloopCount }) => {
      const amplification = amplificationFor(somersloopCount);
      const scale =
        (clockSpeedPercent / 100) **
          machine.clockSpeed.powerConsumptionExponent *
        amplification **
          (machine.productionAmplification?.powerConsumptionExponent ?? 1);
      return {
        maximumMw: total.maximumMw + nominalPower.maximumMw * scale,
        minimumMw: total.minimumMw + nominalPower.minimumMw * scale,
      };
    },
    { maximumMw: 0, minimumMw: 0 },
  );

  return {
    configuration: {
      buildableId: machine.id,
      id: request.id,
      instances: configurations,
      processId: process.id,
      processKind: "recipe",
    },
    kind: "process",
    profile: {
      inputs,
      outputs,
      power: {
        consumed: {
          maximumMw: round(consumed.maximumMw),
          minimumMw: round(consumed.minimumMw),
        },
        produced: emptyPowerProduction(),
      },
    },
  };
}

function createExtractionNode(
  request: ProcessNodeRequest,
  instances: readonly ProcessInstanceRequest[],
): ExtractionProcessNode {
  const process = findProductionProcess(request.processId);
  if (process?.kind !== "extraction") {
    invalid(
      `Extraction Production Process ${request.processId} does not exist.`,
    );
  }
  const extractor = findResourceExtractor(request.buildableId);
  if (!extractor) {
    invalid(`Resource Extractor ${request.buildableId} does not exist.`);
  }
  if (!process.buildableIds.includes(extractor.id)) {
    invalid(`${extractor.name} cannot perform ${process.name}.`);
  }

  const configurations: ExtractorInstanceConfiguration[] = instances.map(
    (instance) => {
      if ((instance.somersloopCount ?? 0) !== 0) {
        invalid("Resource Extractors cannot use Somersloops.");
      }
      if (
        !extractor.usesResourcePurity &&
        instance.resourcePurity !== undefined
      ) {
        invalid(`${extractor.name} does not use Resource Purity.`);
      }
      return {
        clockSpeedPercent: clockSpeedPercentFor(instance, extractor),
        id: instance.id,
        ...(extractor.usesResourcePurity
          ? { resourcePurity: instance.resourcePurity ?? "normal" }
          : {}),
      };
    },
  );

  const outputRate = configurations.reduce(
    (total, { clockSpeedPercent, resourcePurity }) =>
      total +
      extractor.baseRatePerMinute *
        (clockSpeedPercent / 100) *
        (resourcePurity ? RESOURCE_PURITY_MULTIPLIER[resourcePurity] : 1),
    0,
  );
  const consumedMw = configurations.reduce(
    (total, { clockSpeedPercent }) =>
      total +
      extractor.basePowerMw *
        (clockSpeedPercent / 100) **
          extractor.clockSpeed.powerConsumptionExponent,
    0,
  );

  return {
    configuration: {
      buildableId: extractor.id,
      id: request.id,
      instances: configurations,
      processId: process.id,
      processKind: "extraction",
    },
    kind: "process",
    profile: {
      inputs: [],
      outputs: [
        {
          itemId: process.resourceItemId,
          ratePerMinute: round(outputRate),
        },
      ],
      power: {
        consumed: {
          maximumMw: round(consumedMw),
          minimumMw: round(consumedMw),
        },
        produced: emptyPowerProduction(),
      },
    },
  };
}

/**
 * Validates authoritative Process Node configuration and derives its material
 * rates and Power Profile. Omitting instances creates one at 100% Clock Speed,
 * without Somersloops, and at Normal Resource Purity where applicable.
 *
 * @throws {ProcessNodeConfigurationError} if ids, compatibility, or operating
 * settings are invalid.
 */
export function createProcessNode(request: ProcessNodeRequest): ProcessNode {
  requireId(request.id, "Process Node id");
  const process = findProductionProcess(request.processId);
  if (!process) {
    invalid(`Production Process ${request.processId} does not exist.`);
  }
  const instances = requestedInstances(request);
  return process.kind === "recipe"
    ? createRecipeNode(request, instances)
    : createExtractionNode(request, instances);
}
