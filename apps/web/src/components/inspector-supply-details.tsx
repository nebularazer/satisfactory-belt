import { formatPlanningNumber } from "@satisfactory-belt/factory-core";
import type { FactoryNode } from "@satisfactory-belt/factory-core";

import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

export function InspectorSupplyDetails({
  node,
  editor,
  assets,
}: {
  node: FactoryNode;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const issues = editor
    .getFlowAnalysis()
    .issues.filter(
      (issue) =>
        issue.nodeId === node.id &&
        (issue.code === "missing-input" || issue.code === "target-shortfall"),
    );
  if (!issues.length) return null;
  return (
    <details className="border-t pt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        Supply details · {issues.length}{" "}
        {issues.length === 1 ? "unmet requirement" : "unmet requirements"}
      </summary>
      <ul className="mt-2 space-y-2">
        {issues.map((issue) => (
          <li key={`${issue.code}:${issue.itemId}`}>
            {assets.catalog.items[issue.itemId!]?.name}:{" "}
            {issue.perMinute == null ? "Unknown rate" : formatPlanningNumber(issue.perMinute)}{" "}
            {issue.code === "missing-input"
              ? "more needed per minute"
              : "below the requested output per minute"}
          </li>
        ))}
      </ul>
    </details>
  );
}
