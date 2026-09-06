import {
  createNode,
  findRecipe,
  listProductionProcesses,
  type ProductionProcess,
} from "@satisfactory-belt/production";

import type {
  OperationalDiagnostic,
  PlanningRequest,
  ProcessActivity,
  RequestedOutput,
  SteadyStateSolution,
  SteadyStateStatus,
} from "./types";

const TOLERANCE = 1e-8;

type ProcessProfile = Readonly<{
  buildableId: string;
  inputs: readonly RequestedOutput[];
  outputs: readonly RequestedOutput[];
  powerConsumedMw: number;
  powerProducedMw: number;
  process: ProductionProcess;
}>;

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function addRate(rates: Map<string, number>, itemId: string, rate: number) {
  rates.set(itemId, (rates.get(itemId) ?? 0) + rate);
}

function profileFor(
  process: ProductionProcess,
  allowedBuildableIds?: ReadonlySet<string>,
): ProcessProfile | undefined {
  const buildableId = process.buildableIds.find(
    (id) => !allowedBuildableIds || allowedBuildableIds.has(id),
  );
  if (!buildableId || process.kind === "consumption") return undefined;
  const node = createNode({
    buildableId,
    id: `solver:${process.id}`,
    kind: "process",
    processId: process.id,
  });
  if (node.kind !== "process" || node.profile.materials.kind !== "calculated")
    return undefined;
  return {
    buildableId,
    inputs: node.profile.materials.inputs.map(({ itemId, ratePerMinute }) => ({
      itemId,
      ratePerMinute,
    })),
    outputs: node.profile.materials.outputs.map(
      ({ itemId, ratePerMinute }) => ({ itemId, ratePerMinute }),
    ),
    powerConsumedMw: node.profile.power.consumed.maximumMw,
    powerProducedMw: node.profile.power.produced.minimumMw,
    process,
  };
}

function orderedCandidates(request: PlanningRequest) {
  const allowedProcesses = request.allowedProcessIds
    ? new Set(request.allowedProcessIds)
    : undefined;
  const allowedBuildables = request.allowedBuildableIds
    ? new Set(request.allowedBuildableIds)
    : undefined;
  const explicitOrder = new Map(
    request.allowedProcessIds?.map((id, index) => [id, index]) ?? [],
  );
  return listProductionProcesses()
    .filter((process) => !allowedProcesses || allowedProcesses.has(process.id))
    .flatMap((process) => {
      const profile = profileFor(process, allowedBuildables);
      return profile ? [profile] : [];
    })
    .toSorted((left, right) => {
      const explicit =
        (explicitOrder.get(left.process.id) ?? Number.MAX_SAFE_INTEGER) -
        (explicitOrder.get(right.process.id) ?? Number.MAX_SAFE_INTEGER);
      if (explicit) return explicit;
      const leftAlternate =
        left.process.kind === "recipe"
          ? Number(findRecipe(left.process.recipeId)?.alternate ?? false)
          : 0;
      const rightAlternate =
        right.process.kind === "recipe"
          ? Number(findRecipe(right.process.recipeId)?.alternate ?? false)
          : 0;
      return (
        leftAlternate - rightAlternate ||
        left.process.name.localeCompare(right.process.name) ||
        left.process.id.localeCompare(right.process.id)
      );
    });
}

type LinearResult = Readonly<{
  status: SteadyStateStatus;
  values: readonly number[];
}>;

function solveLinear(
  matrix: readonly (readonly number[])[],
  rightHandSide: readonly number[],
  variableCount: number,
): LinearResult {
  const rows = matrix.map((row, index) => [...row, rightHandSide[index] ?? 0]);
  const pivots: number[] = [];
  let pivotRow = 0;

  for (
    let column = 0;
    column < variableCount && pivotRow < rows.length;
    column += 1
  ) {
    let candidate = pivotRow;
    for (let row = pivotRow + 1; row < rows.length; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[candidate]![column]!))
        candidate = row;
    }
    if (Math.abs(rows[candidate]![column]!) <= TOLERANCE) continue;
    [rows[pivotRow], rows[candidate]] = [rows[candidate]!, rows[pivotRow]!];
    const divisor = rows[pivotRow]![column]!;
    for (let entry = column; entry <= variableCount; entry += 1)
      rows[pivotRow]![entry] = rows[pivotRow]![entry]! / divisor;
    for (let row = 0; row < rows.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = rows[row]![column]!;
      if (Math.abs(factor) <= TOLERANCE) continue;
      for (let entry = column; entry <= variableCount; entry += 1) {
        rows[row]![entry] =
          rows[row]![entry]! - factor * rows[pivotRow]![entry]!;
      }
    }
    pivots[pivotRow] = column;
    pivotRow += 1;
  }

  for (const row of rows) {
    if (
      row
        .slice(0, variableCount)
        .every((value) => Math.abs(value) <= TOLERANCE) &&
      Math.abs(row[variableCount]!) > TOLERANCE
    ) {
      return { status: "infeasible", values: [] };
    }
  }
  const values = Array.from({ length: variableCount }, () => 0);
  for (let row = 0; row < pivots.length; row += 1)
    values[pivots[row]!] = rows[row]![variableCount]!;
  if (values.some((value) => value < -TOLERANCE || !Number.isFinite(value))) {
    return { status: "infeasible", values: [] };
  }
  if (pivots.length < variableCount) {
    return {
      status: rightHandSide.every((value) => Math.abs(value) <= TOLERANCE)
        ? "unbounded"
        : "underdetermined",
      values: values.map((value) => Math.max(0, value)),
    };
  }
  return {
    status: "feasible",
    values: values.map((value) => Math.max(0, value)),
  };
}

function cyclicProcesses(profiles: readonly ProcessProfile[]) {
  const producers = new Map<string, number[]>();
  profiles.forEach((profile, index) => {
    for (const output of profile.outputs) {
      const entries = producers.get(output.itemId) ?? [];
      entries.push(index);
      producers.set(output.itemId, entries);
    }
  });
  const edges = profiles.map((profile) => [
    ...new Set(
      profile.inputs.flatMap(({ itemId }) => producers.get(itemId) ?? []),
    ),
  ]);
  const indices = Array.from({ length: profiles.length }, () => -1);
  const lows = Array.from({ length: profiles.length }, () => 0);
  const stack: number[] = [];
  const onStack = new Set<number>();
  const cyclic = new Set<number>();
  let next = 0;
  const visit = (node: number) => {
    indices[node] = next;
    lows[node] = next;
    next += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of edges[node]!) {
      if (indices[target] === -1) {
        visit(target);
        lows[node] = Math.min(lows[node]!, lows[target]!);
      } else if (onStack.has(target)) {
        lows[node] = Math.min(lows[node]!, indices[target]!);
      }
    }
    if (lows[node] !== indices[node]) return;
    const component: number[] = [];
    while (stack.length) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    if (component.length > 1 || edges[node]!.includes(node)) {
      for (const member of component) cyclic.add(member);
    }
  };
  profiles.forEach((_, index) => {
    if (indices[index] === -1) visit(index);
  });
  return cyclic;
}

export function solveSteadyState(
  request: PlanningRequest,
): SteadyStateSolution {
  const diagnostics: OperationalDiagnostic[] = [];
  const demand = new Map<string, number>();
  for (const output of request.outputs) {
    if (
      !output.itemId.trim() ||
      !Number.isFinite(output.ratePerMinute) ||
      output.ratePerMinute <= 0
    ) {
      diagnostics.push({
        code: "solver.request.invalid-output",
        itemId: output.itemId,
        message: "Requested output rates must be positive and finite.",
        severity: "error",
      });
      continue;
    }
    addRate(demand, output.itemId, output.ratePerMinute);
  }
  if (diagnostics.length) {
    return {
      activities: [],
      diagnostics,
      externalResources: [],
      requestedOutputs: request.outputs,
      status: "infeasible",
    };
  }

  const candidates = orderedCandidates(request);
  const available = new Map(
    request.availableResources?.map((resource) => [
      resource.itemId,
      resource,
    ]) ?? [],
  );
  const producerByItem = new Map<string, ProcessProfile>();
  for (const candidate of candidates) {
    for (const output of candidate.outputs) {
      if (!producerByItem.has(output.itemId))
        producerByItem.set(output.itemId, candidate);
    }
  }
  const selected = new Map<string, ProcessProfile>();
  const unresolved = new Set<string>();
  const visiting = new Set<string>();
  const includeItem = (itemId: string) => {
    if (available.has(itemId) || visiting.has(itemId)) return;
    const producer = producerByItem.get(itemId);
    if (!producer) {
      unresolved.add(itemId);
      return;
    }
    if (selected.has(producer.process.id)) return;
    visiting.add(itemId);
    selected.set(producer.process.id, producer);
    for (const input of producer.inputs) includeItem(input.itemId);
    visiting.delete(itemId);
  };
  for (const itemId of demand.keys()) includeItem(itemId);

  const profiles = [...selected.values()].toSorted((left, right) =>
    left.process.id.localeCompare(right.process.id),
  );
  const balancedItems = [
    ...new Set(
      profiles
        .flatMap((profile) => profile.outputs.map(({ itemId }) => itemId))
        .filter((itemId) => !available.has(itemId)),
    ),
  ].toSorted();
  const matrix = balancedItems.map((itemId) =>
    profiles.map((profile) => {
      const produced =
        profile.outputs.find((material) => material.itemId === itemId)
          ?.ratePerMinute ?? 0;
      const consumed =
        profile.inputs.find((material) => material.itemId === itemId)
          ?.ratePerMinute ?? 0;
      return produced - consumed;
    }),
  );
  const rightHandSide = balancedItems.map((itemId) => demand.get(itemId) ?? 0);
  const linear = solveLinear(matrix, rightHandSide, profiles.length);
  let status = linear.status;

  if (profiles.length === 0 && demand.size > 0) status = "feasible";
  const activities: ProcessActivity[] = linear.values
    .map((activity, index) => {
      const profile = profiles[index]!;
      return {
        activity: round(activity),
        buildableId: profile.buildableId,
        inputs: profile.inputs.map((input) => ({
          ...input,
          ratePerMinute: round(input.ratePerMinute * activity),
        })),
        outputs: profile.outputs.map((output) => ({
          ...output,
          ratePerMinute: round(output.ratePerMinute * activity),
        })),
        powerConsumedMw: round(profile.powerConsumedMw * activity),
        powerProducedMw: round(profile.powerProducedMw * activity),
        processId: profile.process.id,
      };
    })
    .filter(({ activity }) => activity > TOLERANCE);

  const netRequirements = new Map<string, number>();
  for (const [itemId, rate] of demand) addRate(netRequirements, itemId, rate);
  for (const activity of activities) {
    for (const input of activity.inputs)
      addRate(netRequirements, input.itemId, input.ratePerMinute);
    for (const output of activity.outputs)
      addRate(netRequirements, output.itemId, -output.ratePerMinute);
  }
  const externalResources = [...netRequirements]
    .filter(([, rate]) => rate > TOLERANCE)
    .map(([itemId, ratePerMinute]) => ({
      ...(available.get(itemId)?.maximumRatePerMinute !== undefined
        ? {
            availableRatePerMinute: available.get(itemId)!.maximumRatePerMinute,
          }
        : {}),
      itemId,
      ratePerMinute: round(ratePerMinute),
    }))
    .toSorted((left, right) => left.itemId.localeCompare(right.itemId));

  for (const requirement of externalResources) {
    const limit = available.get(requirement.itemId)?.maximumRatePerMinute;
    if (limit !== undefined && requirement.ratePerMinute > limit + TOLERANCE) {
      status = "infeasible";
      diagnostics.push({
        code: "solver.resource.capacity",
        context: {
          availableRatePerMinute: limit,
          requiredRatePerMinute: requirement.ratePerMinute,
        },
        itemId: requirement.itemId,
        message: "Available resource capacity is below the required rate.",
        severity: "error",
      });
    } else if (
      !available.has(requirement.itemId) &&
      unresolved.has(requirement.itemId)
    ) {
      diagnostics.push({
        code: "solver.external-resource.required",
        context: { ratePerMinute: requirement.ratePerMinute },
        itemId: requirement.itemId,
        message: "An external resource source is required.",
        severity: "info",
      });
    }
  }
  if (linear.status !== "feasible") {
    diagnostics.push({
      code: `solver.${linear.status}`,
      message: `The production constraints are ${linear.status}.`,
      severity: linear.status === "infeasible" ? "error" : "warning",
    });
  }
  const cyclic = cyclicProcesses(profiles);
  if (
    cyclic.size > 0 &&
    linear.values.some((value, index) => value > TOLERANCE && cyclic.has(index))
  ) {
    diagnostics.push({
      code: "solver.priming-required",
      message:
        "A recycling loop has a feasible steady state but may require initial material to start.",
      severity: "warning",
    });
  }

  return {
    activities,
    diagnostics,
    externalResources,
    requestedOutputs: [...demand]
      .map(([itemId, ratePerMinute]) => ({
        itemId,
        ratePerMinute: round(ratePerMinute),
      }))
      .toSorted((left, right) => left.itemId.localeCompare(right.itemId)),
    status,
  };
}
