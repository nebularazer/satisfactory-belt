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

export function recipeUnlockRequirements(unlock: RecipeUnlock, recipeName: string): string[] {
  const hasMilestone = unlock.requirements.some((group) =>
    group.schematics.some((schematic) => schematic.kind === "milestone"),
  );
  const sourceName = unlock.name.replace(/^Alternate:\s*/, "");
  const rows = unlock.kind === "hard-drive" ? [] : [schematicName(unlock)];
  if (unlock.kind === "hard-drive") {
    if (sourceName !== recipeName.replace(/^Alternate:\s*/, "")) rows.push(schematicName(unlock));
    if (unlock.tier && !hasMilestone) rows.push(`Tier ${unlock.tier}`);
  }
  return rows.concat(
    unlock.requirements.flatMap((group) => {
      const requirements = group.schematics.map(schematicName);
      return group.all ? requirements : [requirements.join(" or ")];
    }),
  );
}

function schematicName(schematic: UnlockSchematic): string {
  switch (schematic.kind) {
    case "milestone":
      return `Tier ${schematic.tier} - ${schematic.name}`;
    case "research":
      return `MAM - ${schematic.name}`;
    case "hard-drive":
      return `Alternate - ${schematic.name.replace(/^Alternate:\s*/, "")}`;
    case "starting":
      return "Available from the start";
    case "event":
      return `FICSMAS - ${schematic.name}`;
    default:
      return schematic.name;
  }
}
