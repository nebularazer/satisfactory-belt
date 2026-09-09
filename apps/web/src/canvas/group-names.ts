export type GroupNames = Readonly<Record<string, string>>;
export const MAX_GROUP_NAME_LENGTH = 160;

export function parseGroupNames(value: unknown): GroupNames | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Group names must be an object.");
  const entries = Object.entries(value);
  if (
    entries.some(
      ([id, name]) =>
        !id ||
        typeof name !== "string" ||
        !name.trim() ||
        name.length > MAX_GROUP_NAME_LENGTH,
    )
  )
    throw new Error(
      "Group names must contain non-empty names up to 160 characters.",
    );
  return Object.fromEntries(entries) as GroupNames;
}
