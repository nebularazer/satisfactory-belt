/* oxlint-disable oxc/no-map-spread -- Solving returns immutable document values. */
import { portId } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import solver from "javascript-lp-solver";
import type { Model, Solution } from "javascript-lp-solver";

import { prepareFlowPlan } from "./flow-plan";
import type { FactoryNode } from "./index";
import type { FactoryDocument } from "./links";
import { createMachineMembers, MAX_MACHINE_COUNT, resizeMachineGroup } from "./machine-settings";
import { resolveProduction } from "./production";
import { settingsKey } from "./settings";

export type FlowSettings = Readonly<{
  /** Gross output requirements. Connections consume these outputs; this is not an export. */
  targets?: Readonly<Record<string, number>>;
  /** Preferred clock used for automatic sizing. Defaults to 100%, with uniform underclocking. */
  clockPercent?: number;
  /** Per-member overrides, authored through individual machine controls. */
  memberClocks?: Readonly<Record<string, number>>;
}>;
export type FlowGroup = Extract<FactoryNode, { kind: "manufacturing" | "extractor" }>;
export const isFlowGroup = (node: FactoryNode): node is FlowGroup =>
  node.kind === "manufacturing" || node.kind === "extractor";
export const isProductionLocked = (node: FactoryNode): boolean =>
  isFlowGroup(node) && Object.keys(node.flow?.targets ?? {}).length > 0;

/** A recipe has one production rate; its coproduct rates always move together. */
export function flowOutputRates(node: FlowGroup, catalog: GameCatalog) {
  const production = resolveProduction(node, catalog);
  if (!Object.keys(node.flow?.targets ?? {}).length) return production.outputs;
  const unit = resolveProduction(
    { ...node, machines: node.machines.map((member) => ({ ...member, clockPercent: 100 })) },
    catalog,
  );
  const factor = Math.max(
    ...unit.outputs.map((output) =>
      output.perMinute ? (node.flow?.targets?.[output.itemId] ?? 0) / output.perMinute : 0,
    ),
  );
  return unit.outputs.map((output) => ({
    ...output,
    perMinute: output.perMinute === null ? null : output.perMinute * factor,
  }));
}

export function validateFlowSettings(node: FlowGroup, catalog: GameCatalog) {
  const { clockPercent, targets, memberClocks } = node.flow ?? {};
  if (
    clockPercent !== undefined &&
    (!Number.isFinite(clockPercent) || clockPercent < 1 || clockPercent > 250)
  )
    throw new Error("Clock speed must be from 1 to 250.");
  if (
    Object.values(memberClocks ?? {}).some(
      (clock) => !Number.isFinite(clock) || clock < 1 || clock > 250,
    )
  )
    throw new Error("Invalid member clock speed.");
  const items = new Set(resolveProduction(node, catalog).outputs.map((rate) => rate.itemId));
  for (const [item, rate] of Object.entries(targets ?? {}))
    if (!items.has(item) || !Number.isFinite(rate) || rate <= 0 || rate > 1e9)
      throw new Error("Production targets require an output material and a positive finite rate.");
}

/** Redistribute the current output over a different whole count. No count constraint is saved.
 * Null means that count would exceed the game's 1–250% authored clock range.
 */
export function rebalanceFlowGroup(
  node: FlowGroup,
  catalog: GameCatalog,
  count: number,
): FlowGroup | null {
  if (!Number.isInteger(count) || count < 1 || count > MAX_MACHINE_COUNT) return null;
  const output = resolveProduction(node, catalog).outputs.find((rate) => (rate.perMinute ?? 0) > 0);
  if (!output?.perMinute) return null;
  const ids = new Set(node.machines.map((member) => member.id));
  let sequence = 0;
  const resized = resizeMachineGroup(node, count, () => {
    let id: string;
    do {
      id = `rebalance-${++sequence}`;
    } while (ids.has(id));
    ids.add(id);
    return id;
  });
  if (!isFlowGroup(resized)) return null;
  const atFullClock = {
    ...resized,
    machines: resized.machines.map((member) => ({ ...member, clockPercent: 100 })),
  };
  const capacity = resolveProduction(atFullClock, catalog).outputs.find(
    (rate) => rate.itemId === output.itemId,
  )?.perMinute;
  if (!capacity) return null;
  const clockPercent = (output.perMinute / capacity) * 100;
  if (clockPercent < 1 - 1e-8 || clockPercent > 250 + 1e-8) return null;
  const clock = Math.min(250, Math.max(1, clockPercent));
  return {
    ...resized,
    flow: { ...node.flow, clockPercent: clock, memberClocks: undefined },
    machines: resized.machines.map((member) => ({ ...member, clockPercent: clock })),
  };
}

/** Choose the smallest whole group at the given ceiling, keeping current output and its lock state. */
export function rebalanceFlowGroupAtClock(
  node: FlowGroup,
  catalog: GameCatalog,
  maximumClock: number,
): FlowGroup | null {
  if (!Number.isFinite(maximumClock) || maximumClock < 1 || maximumClock > 250) return null;
  const output = resolveProduction(node, catalog).outputs.find((rate) => (rate.perMinute ?? 0) > 0);
  if (!output?.perMinute) return null;
  let capacity = 0;
  let count = 0;
  let lastCapacity = 0;
  // Preserve heterogeneous member settings; new members inherit the last member's settings.
  for (const member of node.machines) {
    lastCapacity =
      resolveProduction(
        { ...node, machines: [{ ...member, clockPercent: maximumClock }] },
        catalog,
      ).outputs.find((rate) => rate.itemId === output.itemId)?.perMinute ?? 0;
    capacity += lastCapacity;
    count++;
    if (capacity >= output.perMinute - 1e-7) break;
  }
  if (capacity < output.perMinute - 1e-7) {
    if (!lastCapacity) return null;
    count += Math.ceil((output.perMinute - capacity) / lastCapacity - 1e-7);
  }
  const balanced = rebalanceFlowGroup(node, catalog, count);
  return balanced ? { ...balanced, flow: { ...balanced.flow, clockPercent: maximumClock } } : null;
}

/** Deliberate recipe/resource changes discard targets for outputs that no longer exist. */
export function reconcileFlowTargets(node: FactoryNode, catalog: GameCatalog): FactoryNode {
  if (!isFlowGroup(node) || !node.flow?.targets) return node;
  const outputs = new Set(resolveProduction(node, catalog).outputs.map((rate) => rate.itemId));
  const entries = Object.entries(node.flow.targets);
  const retained = entries.filter(([item]) => outputs.has(item));
  return entries.length === retained.length
    ? node
    : { ...node, flow: { ...node.flow, targets: Object.fromEntries(retained) } };
}

/** Solve each connected component from persistent constraints and authored configuration edits.
 * Comparing documents here keeps every editor command on the same sizing rules.
 * Missing inputs are explicit slack: incomplete plans can be extended backwards without
 * silently changing a production target.
 */
export function resizeFlowGroups(
  document: FactoryDocument,
  catalog: GameCatalog,
  previous?: FactoryDocument,
): FactoryDocument {
  const previousNodes = new Map(previous?.nodes.map((node) => [node.id, node]));
  const editedGroups = new Set(
    document.nodes
      .filter(isFlowGroup)
      .filter((node) => {
        const before = previousNodes.get(node.id);
        return (
          before &&
          before !== node &&
          isFlowGroup(before) &&
          !isProductionLocked(node) &&
          productionSettingsKey(before) !== productionSettingsKey(node)
        );
      })
      .map((node) => node.id),
  );
  const adjacent = new Map(document.nodes.map((node) => [node.id, new Set<string>()]));
  for (const link of document.links) {
    adjacent.get(link.output.nodeId)?.add(link.input.nodeId);
    adjacent.get(link.input.nodeId)?.add(link.output.nodeId);
  }
  const visited = new Set<string>();
  const replacements = new Map<string, FactoryNode>();
  for (const node of document.nodes) {
    if (visited.has(node.id)) continue;
    const ids = new Set([node.id]);
    const queue = [node.id];
    for (let i = 0; i < queue.length; i++) {
      visited.add(queue[i]!);
      for (const id of adjacent.get(queue[i]!) ?? [])
        if (!ids.has(id)) {
          ids.add(id);
          queue.push(id);
        }
    }
    const nodes = document.nodes.filter((entry) => ids.has(entry.id));
    if (
      nodes.length === 1 &&
      !document.links.some((link) => ids.has(link.output.nodeId)) &&
      !nodes.some((entry) => isFlowGroup(entry) && Object.keys(entry.flow?.targets ?? {}).length)
    )
      continue;
    const component = {
      ...document,
      nodes,
      links: document.links.filter((link) => ids.has(link.output.nodeId)),
      externalFlows: document.externalFlows?.filter((entry) => ids.has(entry.port.nodeId)),
    };
    for (const next of solveComponent(component, catalog, editedGroups))
      replacements.set(next.id, next);
  }
  return replacements.size
    ? { ...document, nodes: document.nodes.map((node) => replacements.get(node.id) ?? node) }
    : document;
}

/** Layout and output locks are not production configuration edits. */
function productionSettingsKey(node: FlowGroup): string {
  const { x: _x, y: _y, flow, ...configuration } = node;
  return settingsKey({
    ...configuration,
    clockPercent: flow?.clockPercent,
    memberClocks: flow?.memberClocks,
  });
}

function solveComponent(
  document: FactoryDocument,
  catalog: GameCatalog,
  editedGroups: ReadonlySet<string>,
): readonly FactoryNode[] {
  const plan = prepareFlowPlan(document, catalog);
  if (plan.invalidLinks().length) return [];
  const groups = document.nodes.filter(isFlowGroup).toSorted((a, b) => a.id.localeCompare(b.id));
  for (const node of groups) validateFlowSettings(node, catalog);
  const model: Model = { optimize: "cost", opType: "min", constraints: {}, variables: {} };
  const variables = model.variables;
  const constraints = model.constraints;
  const add = (id: string, coefficients: Record<string, number>) => {
    variables[id] = coefficients;
  };
  const balance = (id: string) => {
    constraints[id] ??= { equal: 0 };
    return id;
  };
  const ports = document.nodes.flatMap((node) => plan.ports(node.id));
  const byPort = new Map(ports.map((port) => [portId(port), port]));
  const key = (ref: Parameters<typeof portId>[0], item: string) =>
    balance(`port:${portId(ref)}:${item}`);
  const units = new Map<string, ReturnType<typeof resolveProduction>>();
  const targetCosts: Record<string, number> = {};
  const missingCosts: Record<string, number> = {};
  const workCosts: Record<string, number> = {};
  const terminalCosts: Record<string, number> = {};

  const outgoing = new Map<string, string[]>();
  for (const link of document.links) {
    const targets = outgoing.get(link.output.nodeId) ?? [];
    targets.push(link.input.nodeId);
    outgoing.set(link.output.nodeId, targets);
  }
  const groupIds = new Set(groups.map((node) => node.id));
  const hasConsumer = (id: string) => {
    const queue = [...(outgoing.get(id) ?? [])];
    const seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const next = queue[i]!;
      if (seen.has(next)) continue;
      seen.add(next);
      if (groupIds.has(next)) return true;
      queue.push(...(outgoing.get(next) ?? []));
    }
    return false;
  };
  // Optional downstream production may use a finite source, but must not grow an
  // unconstrained upstream factory merely to create surplus.
  const supplied = new Set(
    groups
      .filter((node) => isProductionLocked(node) || editedGroups.has(node.id))
      .map((node) => node.id),
  );
  const supplyQueue = [...supplied];
  for (let i = 0; i < supplyQueue.length; i++)
    for (const id of outgoing.get(supplyQueue[i]!) ?? [])
      if (!supplied.has(id)) {
        supplied.add(id);
        supplyQueue.push(id);
      }

  // With no locked source feeding a terminal group, its current production supplies
  // the plan's demand. Derive this from topology on each solve; never save a lock.
  const requirements = new Map(groups.map((node) => [node.id, node.flow?.targets ?? {}]));
  for (const node of groups) {
    if (!editedGroups.has(node.id) && (supplied.has(node.id) || hasConsumer(node.id))) continue;
    requirements.set(
      node.id,
      Object.fromEntries(
        resolveProduction(node, catalog)
          .outputs.filter((rate) => rate.perMinute !== null && rate.perMinute > 0)
          .map((rate) => [rate.itemId, rate.perMinute!]),
      ),
    );
  }
  const hasTargets = [...requirements.values()].some((targets) => Object.keys(targets).length);
  if (!hasTargets) return [];

  for (const node of groups) {
    // Averaging members at 100% preserves mixed purities/amplification when count is fixed.
    const template =
      editedGroups.has(node.id) && node.machines.some((member) => member.clockPercent > 0)
        ? node.machines
        : node.machines.map((m) => ({
            ...m,
            clockPercent: node.flow?.memberClocks
              ? (node.flow.memberClocks[m.id] ?? node.flow.clockPercent ?? 100)
              : 100,
          }));
    const templateWork = template.reduce((sum, member) => sum + member.clockPercent / 100, 0);
    const unit = resolveProduction({ ...node, machines: template }, catalog);
    const normalized = {
      ...unit,
      inputs: unit.inputs.map((r) => ({
        ...r,
        perMinute: r.perMinute === null ? null : r.perMinute / templateWork,
      })),
      outputs: unit.outputs.map((r) => ({
        ...r,
        perMinute: r.perMinute === null ? null : r.perMinute / templateWork,
      })),
    };
    if ([...normalized.inputs, ...normalized.outputs].some((rate) => rate.perMinute === null))
      return [];
    units.set(node.id, normalized);
    const variable = `group:${node.id}`;
    const cap = `capacity:${node.id}`;
    // The technical document-size bound is not an authored machine capacity.
    const capacity = (MAX_MACHINE_COUNT * (node.flow?.clockPercent ?? 100)) / 100;
    constraints[cap] = { max: capacity };
    const coefficients: Record<string, number> = { [cap]: 1 };
    workCosts[variable] = 1;
    for (const port of plan.ports(node.id)) {
      if (!port.itemId) continue;
      const rate = normalized[port.direction === "input" ? "inputs" : "outputs"].find(
        (r) => r.itemId === port.itemId,
      )?.perMinute;
      if (rate == null) continue;
      const k = key(port, port.itemId);
      coefficients[k] = port.direction === "input" ? -rate : rate;
      if (port.direction === "input") {
        const missing = `missing:${k}`;
        add(missing, { [k]: 1 });
        // An unfinished downstream recipe can still be sized from its connected
        // ingredient; the other ingredients remain visible as missing inputs.
        if (
          !supplied.has(node.id) ||
          Object.keys(requirements.get(node.id)!).length ||
          document.links.some((link) => portId(link.input) === portId(port))
        )
          missingCosts[missing] = 1;
      } else {
        add(`surplus:${k}`, { [k]: -1 });
        const target = requirements.get(node.id)![port.itemId];
        if (target !== undefined) {
          const t = `target:${k}`;
          constraints[t] = { min: target };
          coefficients[t] = rate;
          add(`shortfall:${k}`, { [t]: 1 });
          targetCosts[`shortfall:${k}`] = 1 / target;
        }
        // In supply-led plans use remaining finite capacity to make terminal products.
        if (
          supplied.has(node.id) &&
          !Object.keys(requirements.get(node.id)!).length &&
          !hasConsumer(node.id)
        )
          terminalCosts[variable] = (terminalCosts[variable] ?? 0) - rate;
      }
    }
    const requested = Object.entries(requirements.get(node.id)!).map(
      ([item, target]) =>
        target / (normalized.outputs.find((rate) => rate.itemId === item)?.perMinute ?? Infinity),
    );
    if (requested.length) constraints[cap] = { max: Math.min(capacity, Math.max(...requested)) };
    // An unlocked operating edit defines this solve's production without saving a lock.
    // Preserve its exact members/settings; other unlocked groups can still follow it.
    if (editedGroups.has(node.id))
      constraints[cap] = {
        equal: node.machines.reduce((sum, member) => sum + member.clockPercent / 100, 0),
      };
    add(variable, coefficients);
  }

  for (const link of document.links.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const output = byPort.get(portId(link.output));
    const input = byPort.get(portId(link.input));
    if (!output || !input || !["belt", "pipe"].includes(output.transport)) continue;
    for (const item of [...plan.materials(output)].toSorted()) {
      if (input.itemId && input.itemId !== item) continue;
      add(`link:${link.id}:${item}`, { [key(output, item)]: -1, [key(input, item)]: 1 });
    }
  }
  for (const node of document.nodes.filter((entry) => !isFlowGroup(entry))) {
    const nodePorts = plan.ports(node.id);
    const storage = node.kind === "facility" && node.configuration.type === "storage";
    if (node.kind === "logistics" || storage) {
      const items = new Set(nodePorts.flatMap((p) => [...plan.materials(p)]));
      for (const item of items) {
        const pool = balance(`pool:${node.id}:${item}`);
        for (const port of nodePorts) {
          if (!plan.materials(port).has(item)) continue;
          const sign = port.direction === "input" ? 1 : -1;
          add(`transfer:${portId(port)}:${item}`, { [key(port, item)]: -sign, [pool]: sign });
        }
        if (storage) {
          const stored = `stored:${node.id}:${item}`;
          add(stored, { [pool]: -1 });
        }
      }
    } else {
      const production = resolveProduction(node, catalog);
      for (const port of nodePorts) {
        if (port.itemId) {
          const rate = production[port.direction === "input" ? "inputs" : "outputs"].find(
            (r) => r.itemId === port.itemId,
          )?.perMinute;
          if (rate != null) {
            constraints[key(port, port.itemId)] = {
              equal: port.direction === "input" ? rate : -rate,
            };
            if (port.direction === "output")
              add(`surplus:${portId(port)}`, { [key(port, port.itemId)]: -1 });
          }
        } else if (port.direction === "input")
          for (const item of plan.materials(port))
            add(`disposal:${portId(port)}:${item}`, { [key(port, item)]: -1 });
      }
    }
  }
  for (const [i, entry] of (document.externalFlows ?? []).entries()) {
    const port = byPort.get(portId(entry.port));
    if (!port) continue;
    const capacity = `external:${i}`;
    constraints[capacity] = { max: entry.perMinute };
    add(capacity, {
      [capacity]: 1,
      [key(port, entry.itemId)]: port.direction === "input" ? 1 : -1,
    });
  }
  let result: Solution | undefined;
  // Lexicographic solves avoid rate-dependent magic weights. Authored targets stay fixed.
  const objectives = [...(hasTargets ? [targetCosts] : []), missingCosts, terminalCosts, workCosts];
  for (const [stage, costs] of objectives.entries()) {
    if (!Object.keys(costs).length) continue;
    for (const [id, coefficients] of Object.entries(variables)) coefficients.cost = costs[id] ?? 0;
    // The library types its optional full-model result as unknown. This call requests the numeric solution.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    result = solver.Solve(model, 1e-9) as Solution;
    if (!result.feasible || !result.bounded || !Number.isFinite(result.result)) return [];
    const preserve = `objective:${stage}`;
    constraints[preserve] = { max: result.result };
    for (const [id, cost] of Object.entries(costs)) variables[id]![preserve] = cost;
  }
  if (!result) return [];
  return groups.flatMap((node) => {
    if (editedGroups.has(node.id)) return [];
    const solved = Math.max(0, Number(result[`group:${node.id}`]) || 0);
    const equivalent = Math.abs(solved - Math.round(solved)) < 1e-8 ? Math.round(solved) : solved;
    const clockPercent = node.flow?.clockPercent ?? 100;
    let count = Math.max(1, Math.ceil((equivalent * 100) / clockPercent - 1e-7));
    if (node.flow?.memberClocks) {
      // Individual ceilings can require more machines than the group's default.
      let capacity = 0;
      count = 0;
      for (const member of node.machines) {
        capacity += (node.flow.memberClocks[member.id] ?? clockPercent) / 100;
        count++;
        if (capacity >= equivalent - 1e-7) break;
      }
      count += Math.max(0, Math.ceil(((equivalent - capacity) * 100) / clockPercent - 1e-7));
      count = Math.min(MAX_MACHINE_COUNT, Math.max(1, count));
    }
    const clock = Math.min(clockPercent, (equivalent / count) * 100);
    const current = resolveProduction(node, catalog);
    const unit = units.get(node.id)!;
    const sameRates = (["inputs", "outputs"] as const).every((side) =>
      unit[side].every(
        (r) =>
          Math.abs(
            (current[side].find((entry) => entry.itemId === r.itemId)?.perMinute ?? 0) -
              (r.perMinute ?? 0) * equivalent,
          ) < 1e-5,
      ),
    );
    if (
      sameRates &&
      node.machines.length === count &&
      node.machines.every(
        (m) => m.clockPercent <= (node.flow?.memberClocks?.[m.id] ?? clockPercent) + 1e-8,
      )
    )
      return [];
    const { id: _id, ...template } = node.machines[0]!;
    const resized = createMachineMembers(
      count,
      template,
      (i) => node.machines[i]?.id ?? `auto-${i + 1}`,
    ).map((member, i) => node.machines[i] ?? member);
    const maximumWork = resized.reduce(
      (sum, member) => sum + (node.flow?.memberClocks?.[member.id] ?? clockPercent) / 100,
      0,
    );
    const machines = resized.map((member) => ({
      ...member,
      clockPercent:
        equivalent < 1e-7
          ? 0
          : node.flow?.memberClocks
            ? ((node.flow.memberClocks[member.id] ?? clockPercent) * equivalent) / maximumWork
            : clock,
    }));
    const next = { ...node, machines };
    return settingsKey(next) === settingsKey(node) ? [] : [next];
  });
}
