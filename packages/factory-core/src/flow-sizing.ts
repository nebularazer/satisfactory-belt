/* oxlint-disable oxc/no-map-spread -- Solving returns immutable document values. */
import { portId } from "@satisfactory-belt/canvas-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";
import solver from "javascript-lp-solver";
import type { Model, Solution } from "javascript-lp-solver";

import { prepareFlowPlan } from "./flow-plan";
import { addFlowSharing } from "./flow-sharing";
import type { FactoryNode } from "./index";
import type { FactoryDocument } from "./links";
import { createMachineMembers, MAX_MACHINE_COUNT, resizeMachineGroup } from "./machine-settings";
import { resolveProduction } from "./production";
import { settingsKey } from "./settings";

export type FlowSettings = Readonly<{
  /** Authored whole-machine capacity. Null explicitly enables automatic sizing.
   * Extractors default to their existing machine count; manufacturing defaults to Auto. */
  machineLimit?: number | null;
  /** Optional output ceiling; it never forces unused upstream production. */
  outputLimit?: Readonly<{ itemId: string; perMinute: number }>;
  /** Auto underclocks whole machines; manual keeps the authored clock and may idle. */
  clockMode?: "auto" | "manual";
  /** Solved duty cycle for manual clocks. Never an authored limit. */
  utilization?: number;
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
export function flowMachineLimit(node: FlowGroup): number | undefined {
  return node.flow?.machineLimit === null
    ? undefined
    : (node.flow?.machineLimit ?? (node.kind === "extractor" ? node.machines.length : undefined));
}
/** Configured capacity stays independent of the calculated operating clocks. */
export function flowCapacityNode(node: FlowGroup): FlowGroup {
  const limit = flowMachineLimit(node);
  if (limit === undefined) return node;
  let sequence = 0;
  const ids = new Set(node.machines.map((member) => member.id));
  const resized = resizeMachineGroup(node, limit, () => {
    let id: string;
    do {
      id = `capacity-${++sequence}`;
    } while (ids.has(id));
    ids.add(id);
    return id;
  });
  if (!isFlowGroup(resized)) return node;
  return {
    ...resized,
    flow: { ...resized.flow, utilization: 1 },
    machines: resized.machines.map((member) => ({
      ...member,
      clockPercent:
        node.flow?.memberClocks?.[member.id] ??
        node.flow?.clockPercent ??
        (node.flow?.machineLimit === undefined ? member.clockPercent || 100 : 100),
    })),
  };
}
export const isProductionLocked = (node: FactoryNode): boolean =>
  isFlowGroup(node) && Object.keys(node.flow?.targets ?? {}).length > 0;

/** A recipe has one production rate; its coproduct rates always move together. */
export function flowOutputRates(node: FlowGroup, catalog: GameCatalog) {
  const production = resolveProduction(node, catalog);
  if (!Object.keys(node.flow?.targets ?? {}).length) return production.outputs;
  const unit = resolveProduction(
    {
      ...node,
      flow: { ...node.flow, utilization: 1 },
      machines: node.machines.map((member) => ({ ...member, clockPercent: 100 })),
    },
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
  const { clockPercent, targets, memberClocks, machineLimit, utilization, clockMode } =
    node.flow ?? {};
  if (clockMode !== undefined && clockMode !== "auto" && clockMode !== "manual")
    throw new Error("Invalid clock mode.");
  if (
    utilization !== undefined &&
    (!Number.isFinite(utilization) || utilization < 0 || utilization > 1)
  )
    throw new Error("Invalid machine utilization.");
  if (
    machineLimit != null &&
    (!Number.isInteger(machineLimit) || machineLimit < 1 || machineLimit > MAX_MACHINE_COUNT)
  )
    throw new Error("Machine capacity must be a positive whole number.");
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
  const limits = node.flow?.outputLimit
    ? { [node.flow.outputLimit.itemId]: node.flow.outputLimit.perMinute }
    : {};
  for (const [item, rate] of Object.entries({ ...targets, ...limits }))
    if (!items.has(item) || !Number.isFinite(rate) || rate <= 0 || rate > 1e9)
      throw new Error("Production targets require an output material and a positive finite rate.");
}

/** Redistribute the current output over a different whole count. The new count becomes the authored capacity.
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
    flow: { ...node.flow, machineLimit: count, clockPercent: clock, memberClocks: undefined },
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
  if (!isFlowGroup(node)) return node;
  const outputLimit = node.flow?.outputLimit;
  if (
    outputLimit &&
    !resolveProduction(node, catalog).outputs.some((rate) => rate.itemId === outputLimit.itemId)
  )
    node = { ...node, flow: { ...node.flow, outputLimit: undefined } };
  if (!node.flow?.targets) return node;
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
          node.flow?.clockMode === undefined &&
          flowMachineLimit(node) === undefined &&
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
      !nodes.some(
        (entry) =>
          isFlowGroup(entry) &&
          (entry.flow?.outputLimit || Object.keys(entry.flow?.targets ?? {}).length),
      )
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
  const surplusCosts: Record<string, number> = {};

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
      .filter(
        (node) =>
          flowMachineLimit(node) !== undefined ||
          Boolean(node.flow?.outputLimit) ||
          isProductionLocked(node) ||
          editedGroups.has(node.id),
      )
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
  if (!hasTargets && !supplied.size) return [];

  for (const node of groups) {
    // Averaging members at 100% preserves mixed purities/amplification when count is fixed.
    const capacityNode = flowCapacityNode(node);
    const template =
      editedGroups.has(node.id) && node.machines.some((member) => member.clockPercent > 0)
        ? node.machines
        : flowMachineLimit(node) !== undefined
          ? capacityNode.machines
          : node.machines.map((m) => ({
              ...m,
              clockPercent: node.flow?.memberClocks
                ? (node.flow.memberClocks[m.id] ?? node.flow.clockPercent ?? 100)
                : (node.flow?.clockPercent ?? 100),
            }));
    const templateWork = template.reduce((sum, member) => sum + member.clockPercent / 100, 0);
    const unit = resolveProduction(
      { ...node, flow: { ...node.flow, utilization: 1 }, machines: template },
      catalog,
    );
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
    const limit = flowMachineLimit(node);
    const capacity =
      limit === undefined
        ? (MAX_MACHINE_COUNT * (node.flow?.clockPercent ?? 100)) / 100
        : templateWork;
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
        // An unfinished branch may have an undeclared input. A connected input must
        // use its actual suppliers; never invent imports to bypass finite capacity.
        const connected = document.links.some((link) => portId(link.input) === portId(port));
        if (!connected) add(missing, { [k]: 1 });
        // An unfinished downstream recipe can still be sized from its connected
        // ingredient; the other ingredients remain visible as missing inputs.
        if (
          !connected &&
          (!supplied.has(node.id) || Object.keys(requirements.get(node.id)!).length)
        )
          missingCosts[missing] = 1;
      } else {
        add(`surplus:${k}`, { [k]: -1 });
        surplusCosts[`surplus:${k}`] = 1;
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
    if (node.flow?.outputLimit) {
      const limitRate = normalized.outputs.find(
        (rate) => rate.itemId === node.flow!.outputLimit!.itemId,
      )?.perMinute;
      if (limitRate)
        constraints[cap] = { max: Math.min(capacity, node.flow.outputLimit.perMinute / limitRate) };
    }
    // An unlocked operating edit defines this solve's production without saving a lock.
    // Keep its settings when supply permits; connected shortages may lower utilization.
    if (editedGroups.has(node.id))
      constraints[cap] = {
        max: node.machines.reduce((sum, member) => sum + member.clockPercent / 100, 0),
      };
    add(variable, coefficients);
  }

  const siblings = new Map<string, string[]>();
  const byNode = new Map(document.nodes.map((node) => [node.id, node]));
  for (const link of document.links.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const output = byPort.get(portId(link.output));
    const input = byPort.get(portId(link.input));
    if (!output || !input || !["belt", "pipe"].includes(output.transport)) continue;
    for (const item of [...plan.materials(output)].toSorted()) {
      if (input.itemId && input.itemId !== item) continue;
      const variable = `link:${link.id}:${item}`;
      add(variable, { [key(output, item)]: -1, [key(input, item)]: 1 });
      for (const port of [output, input]) {
        const neighbor = byNode.get(port === output ? input.nodeId : output.nodeId);
        // Compare equivalent production branches, not different recipes or storage.
        if (!neighbor || !isFlowGroup(neighbor)) continue;
        const operation =
          neighbor.kind === "manufacturing" ? neighbor.recipeId : neighbor.resourceId;
        const id = `${portId(port)}:${item}:${neighbor.kind}:${operation}`;
        const family = siblings.get(id) ?? [];
        family.push(variable);
        siblings.set(id, family);
      }
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
  const sharingCosts: Record<string, number> = {};
  let result: Solution | undefined;
  // Lexicographic solves avoid rate-dependent magic weights. Authored targets stay fixed.
  const objectives = [
    ...(hasTargets ? [targetCosts] : []),
    missingCosts,
    terminalCosts,
    surplusCosts,
    sharingCosts,
    workCosts,
  ];
  for (const [stage, costs] of objectives.entries()) {
    // Keep the earlier target/throughput solves small.
    if (costs === sharingCosts)
      Object.assign(sharingCosts, addFlowSharing(model, siblings.values()));
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
    const solved = Math.max(0, Number(result[`group:${node.id}`]) || 0);
    if (
      editedGroups.has(node.id) &&
      Math.abs(solved - node.machines.reduce((sum, m) => sum + m.clockPercent / 100, 0)) < 1e-8
    )
      return [];
    const equivalent = Math.abs(solved - Math.round(solved)) < 1e-8 ? Math.round(solved) : solved;
    const authored = flowCapacityNode(node);
    const authoredClocks = authored.machines.map((m) => m.clockPercent);
    const clockPercent =
      node.flow?.clockPercent ??
      (flowMachineLimit(node) !== undefined ? Math.max(...authoredClocks) : 100);
    const memberClocks =
      node.flow?.memberClocks ??
      (new Set(authoredClocks).size > 1
        ? Object.fromEntries(authored.machines.map((m) => [m.id, m.clockPercent]))
        : undefined);
    const limit = flowMachineLimit(node);
    let count = limit ?? Math.max(1, Math.ceil((equivalent * 100) / clockPercent - 1e-7));
    if (limit === undefined && memberClocks) {
      // Individual ceilings can require more machines than the group's default.
      let capacity = 0;
      count = 0;
      for (const member of node.machines) {
        capacity += (memberClocks[member.id] ?? clockPercent) / 100;
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
      (node.flow?.clockMode !== "manual" ||
        node.machines.every(
          (m) => Math.abs(m.clockPercent - (memberClocks?.[m.id] ?? clockPercent)) < 1e-8,
        )) &&
      node.machines.length === count &&
      node.machines.every((m) => m.clockPercent <= (memberClocks?.[m.id] ?? clockPercent) + 1e-8)
    )
      return [];
    const { id: _id, ...template } = node.machines[0]!;
    const resized = createMachineMembers(
      count,
      template,
      (i) => node.machines[i]?.id ?? `auto-${i + 1}`,
    ).map((member, i) => node.machines[i] ?? member);
    const maximumWork = resized.reduce(
      (sum, member) => sum + (memberClocks?.[member.id] ?? clockPercent) / 100,
      0,
    );
    const machines = resized.map((member) => ({
      ...member,
      clockPercent:
        node.flow?.clockMode === "manual"
          ? (memberClocks?.[member.id] ?? clockPercent)
          : equivalent < 1e-7
            ? 0
            : memberClocks
              ? ((memberClocks[member.id] ?? clockPercent) * equivalent) / maximumWork
              : clock,
    }));
    const next = {
      ...node,
      machines,
      ...(limit !== undefined || node.flow?.clockMode !== undefined
        ? {
            flow: {
              ...node.flow,
              machineLimit: limit ?? null,
              utilization:
                node.flow?.clockMode === "manual"
                  ? Math.min(1, Math.max(0, equivalent / maximumWork))
                  : 1,
              clockPercent,
              ...(memberClocks ? { memberClocks } : {}),
            },
          }
        : {}),
    };
    return settingsKey(next) === settingsKey(node) ? [] : [next];
  });
}
