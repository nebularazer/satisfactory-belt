import type { GameCatalog } from "@satisfactory-belt/game-data";

import type { FactoryNode, MachineMember } from "./index";

/** Bounds allocations for user-entered machine counts. */
export const MAX_MACHINE_COUNT = 10_000;

export type MachineGroup = Exclude<FactoryNode, { kind: "logistics" }>;
export type MachineSetting = "clockPercent" | "sloopsUsed";
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
  return {
    clock: machine?.canOverclock ?? extractor?.canOverclock ?? false,
    sloopSlots: machine?.sloopSlots ?? 0,
  };
}

export function commonSetting(
  members: readonly MachineMember[],
  setting: MachineSetting,
): number | null {
  const value = members[0]?.[setting];
  return value !== undefined && members.every((member) => member[setting] === value) ? value : null;
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
  const { clock, sloopSlots } = machineCapabilities(node, catalog);
  for (const member of node.machines) {
    if (!member.id || member.id === "all" || ids.has(member.id))
      throw new Error("Invalid machine identity.");
    ids.add(member.id);
    if (
      !Number.isFinite(member.clockPercent) ||
      member.clockPercent < 1 ||
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
