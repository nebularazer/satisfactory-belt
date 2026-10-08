export interface UnlockSchematic {
  id: string;
  name: string;
  kind: "milestone" | "research" | "hard-drive" | "tutorial" | "starting" | "event" | "other";
  /** HUB tier, or the minimum tier for entering the Hard Drive pool. */
  tier?: number;
}

export interface RecipeUnlock extends UnlockSchematic {
  /** Groups are required together; schematics within each group use all/any semantics. */
  requirements: { all: boolean; schematics: UnlockSchematic[] }[];
}

export function recipeUnlockDescription(
  unlock: RecipeUnlock,
  recipeName: string,
): {
  method: string;
  prerequisites: string[];
} {
  const hasMilestone = unlock.requirements.some((group) =>
    group.schematics.some((schematic) => schematic.kind === "milestone"),
  );
  const sourceName = unlock.name.replace(/^Alternate:\s*/, "");
  const sourceSuffix =
    sourceName !== recipeName.replace(/^Alternate:\s*/, "") ? ` · ${sourceName}` : "";
  return {
    method:
      unlock.kind === "hard-drive"
        ? `Hard Drive research${sourceSuffix}${unlock.tier && !hasMilestone ? ` · Tier ${unlock.tier}` : ""}`
        : schematicName(unlock),
    prerequisites: unlock.requirements.map(
      (group) =>
        `Requires ${group.schematics.map(schematicName).join(group.all ? " and " : " or ")}`,
    ),
  };
}

function schematicName(schematic: UnlockSchematic): string {
  switch (schematic.kind) {
    case "milestone":
      return `Tier ${schematic.tier} · ${schematic.name}`;
    case "research":
      return `MAM · ${schematic.name}`;
    case "hard-drive":
      return `Hard Drive · ${schematic.name.replace(/^Alternate:\s*/, "")}`;
    case "starting":
      return "Available from the start";
    case "event":
      return `FICSMAS · ${schematic.name}`;
    default:
      return schematic.name;
  }
}
