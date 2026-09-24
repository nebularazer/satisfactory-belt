import type { GameCatalog } from "@satisfactory-belt/game-data";

import { facilityCanGroup, parsePurity } from "./facilities";
import type { FactoryNode, MachineMember } from "./index";

/** Bounds allocations for user-entered machine counts. */
export const MAX_MACHINE_COUNT = 10_000;

export type MachineGroup = Exclude<FactoryNode, { kind: "logistics" }>;
export type MachineSetting =
  | "clockPercent"
  | "sloopsUsed"
  | "purity"
  | "loadPercent"
  | "impureSatellites"
  | "normalSatellites"
  | "pureSatellites";
/** "all" or a member ID local to its group. */
export type MachineScope = string;

export function createMachineMembers(
  count: number,
  settings: Partial<Omit<MachineMember, "id">> = {},
  createId: (index: number) => string = (index) => String(index + 1),
): readonly MachineMember[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_MACHINE_COUNT)
    throw new Error(`Machine count must be a whole number from 1 to ${MAX_MACHINE_COUNT}.`);
  return Array.from({ length: count }, (_, index) => ({
    id: createId(index),
    clockPercent: 100,
    sloopsUsed: 0,
    ...settings,
  }));
}

export function machineCapabilities(node: MachineGroup, catalog: GameCatalog) {
  const machine = node.kind === "manufacturing" ? catalog.machines[node.machineId] : null;
  const extractor = node.kind === "extractor" ? catalog.extractors[node.extractorId] : null;
  const building = node.kind === "facility" ? catalog.buildings?.[node.buildingId] : null;
  return {
    satellites: building?.kind === "well",
    purity: extractor?.hasPurity ?? building?.kind === "geothermal",
    load: building?.loadFollowing ?? false,
    matrices: building?.kind === "augmenter",
    groupable: !building || facilityCanGroup(building),
    clock: machine?.canOverclock ?? extractor?.canOverclock ?? building?.canOverclock ?? false,
    sloopSlots: machine?.sloopSlots ?? 0,
  };
}

export function commonSetting(
  members: readonly MachineMember[],
  setting: MachineSetting,
): number | null {
  const value = members[0] ? memberSetting(members[0], setting) : undefined;
  return value !== undefined && members.every((member) => memberSetting(member, setting) === value)
    ? value
    : null;
}

export function scopedMachines(node: MachineGroup, scope: MachineScope): readonly MachineMember[] {
  if (scope === "all") return node.machines;
  const member = node.machines.find((entry) => entry.id === scope);
  if (!member) throw new Error("This machine is no longer in the group.");
  return [member];
}

export function validateMachineMembers(node: MachineGroup, catalog: GameCatalog) {
  if (!node.machines.length || node.machines.length > MAX_MACHINE_COUNT)
    throw new Error(`A group must contain 1 to ${MAX_MACHINE_COUNT} machines.`);
  const ids = new Set<string>();
  const { clock, sloopSlots, purity, load, matrices, satellites } = machineCapabilities(
    node,
    catalog,
  );
  for (const member of node.machines) {
    if (!member.id || member.id === "all" || ids.has(member.id))
      throw new Error("Invalid machine identity.");
    ids.add(member.id);
    const counts = [
      member.impureSatellites ?? 0,
      member.normalSatellites ?? 0,
      member.pureSatellites ?? 0,
    ];
    if (
      counts.some((n) => !Number.isInteger(n) || n < 0) ||
      counts.reduce((a, b) => a + b, 0) > 10 ||
      (!satellites && counts.some(Boolean))
    )
      throw new Error("A well supports zero to ten satellites.");
    if (member.purity !== undefined && (!purity || ![0.5, 1, 2].includes(member.purity)))
      throw new Error("Invalid resource purity.");
    if (
      member.loadPercent !== undefined &&
      (!load ||
        !Number.isFinite(member.loadPercent) ||
        member.loadPercent < 0 ||
        member.loadPercent > 100)
    )
      throw new Error("Invalid generator load.");
    if (
      member.suppliedMatrices !== undefined &&
      (!matrices || typeof member.suppliedMatrices !== "boolean")
    )
      throw new Error("Invalid matrix supply setting.");
    if (
      !Number.isFinite(member.clockPercent) ||
      member.clockPercent < (node.kind === "manufacturing" || node.kind === "extractor" ? 0 : 1) ||
      member.clockPercent > 250 ||
      (!clock && member.clockPercent !== 100)
    )
      throw new Error("Invalid clock: use a percentage from 1 to 250 on supported machines.");
    if (
      !Number.isInteger(member.sloopsUsed) ||
      member.sloopsUsed < 0 ||
      member.sloopsUsed > sloopSlots
    )
      throw new Error(`Invalid Sloop count: use a whole number from 0 to ${sloopSlots}.`);
  }
}

/** A bulk edit changes one setting and retains each member's identity and other settings. */
export function setMachineSetting(
  node: MachineGroup,
  catalog: GameCatalog,
  scope: MachineScope,
  setting: MachineSetting,
  value: number,
): MachineGroup {
  if (setting === "clockPercent" && (value < 1 || value > 250 || !Number.isFinite(value)))
    throw new Error("Clock speed must be from 1 to 250.");
  if (node.kind === "extractor" && setting === "purity" && scope !== "all")
    throw new Error("Miner purity applies to the entire group.");
  const members = scopedMachines(node, scope);
  if (members.every((member) => member[setting] === value)) return node;
  const next = {
    ...node,
    machines: node.machines.map((member) =>
      scope === "all" || member.id === scope ? { ...member, [setting]: value } : member,
    ),
  };
  validateMachineMembers(next, catalog);
  return next;
}

/** New members inherit common settings; a mixed setting follows the last member. */
export function resizeMachineGroup(
  node: MachineGroup,
  count: number,
  createId: () => string,
): MachineGroup {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_MACHINE_COUNT)
    throw new Error(`Machine count must be a whole number from 1 to ${MAX_MACHINE_COUNT}.`);
  if (count === node.machines.length) return node;
  const last = node.machines.at(-1)!;
  const inherited = {
    clockPercent: commonSetting(node.machines, "clockPercent") ?? last.clockPercent,
    sloopsUsed: commonSetting(node.machines, "sloopsUsed") ?? last.sloopsUsed,
    ...(last.purity !== undefined
      ? { purity: parsePurity(commonSetting(node.machines, "purity") ?? last.purity) }
      : {}),
    ...(last.loadPercent !== undefined
      ? { loadPercent: commonSetting(node.machines, "loadPercent") ?? last.loadPercent }
      : {}),
    ...(last.impureSatellites !== undefined ||
    last.normalSatellites !== undefined ||
    last.pureSatellites !== undefined
      ? {
          impureSatellites:
            commonSetting(node.machines, "impureSatellites") ?? last.impureSatellites ?? 0,
          normalSatellites:
            commonSetting(node.machines, "normalSatellites") ?? last.normalSatellites ?? 0,
          pureSatellites:
            commonSetting(node.machines, "pureSatellites") ?? last.pureSatellites ?? 0,
        }
      : {}),
    ...(last.suppliedMatrices !== undefined
      ? { suppliedMatrices: commonMatrices(node.machines) ?? last.suppliedMatrices }
      : {}),
  };
  return {
    ...node,
    machines:
      count < node.machines.length
        ? node.machines.slice(0, count)
        : [
            ...node.machines,
            ...createMachineMembers(count - node.machines.length, inherited, createId),
          ],
  };
}

export function memberSetting(member: MachineMember, setting: MachineSetting): number {
  return member[setting] ?? (setting.endsWith("Satellites") ? 0 : setting === "purity" ? 1 : 100);
}
export function commonMatrices(members: readonly MachineMember[]): boolean | null {
  const value = members[0]?.suppliedMatrices ?? false;
  return members.every((member) => (member.suppliedMatrices ?? false) === value) ? value : null;
}
export function setMatrixSupply(
  node: MachineGroup,
  catalog: GameCatalog,
  scope: MachineScope,
  supplied: boolean,
): MachineGroup {
  scopedMachines(node, scope);
  const next = {
    ...node,
    machines: node.machines.map((member) =>
      scope === "all" || member.id === scope ? { ...member, suppliedMatrices: supplied } : member,
    ),
  };
  validateMachineMembers(next, catalog);
  return next;
}
