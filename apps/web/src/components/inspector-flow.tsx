/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Controls belong to the selected group. */
import { resolveProduction } from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;

export function InspectorFlow({
  node,
  editor,
  assets,
}: {
  node: FlowGroup;
  editor: Editor;
  assets: GameAssets;
}) {
  const production = resolveProduction(node, assets.catalog);
  const issues = editor
    .getFlowAnalysis()
    .issues.filter(
      (issue) =>
        issue.nodeId === node.id &&
        (issue.code === "missing-input" || issue.code === "target-shortfall"),
    );
  return (
    <section aria-label="Production constraints" className="space-y-3">
      {production.outputs.map((output) => (
        <ConstraintField
          key={`${output.itemId}:${node.flow?.targets?.[output.itemId] ?? "auto"}`}
          label={`${assets.catalog.items[output.itemId]!.name} target`}
          value={node.flow?.targets?.[output.itemId]}
          placeholder="Automatic"
          max={1e9}
          onCommit={(value) => editor.setProductionTarget(node.id, output.itemId, value)}
        />
      ))}
      {issues.map((issue) => (
        <output key={`${issue.code}:${issue.itemId}`} className="block text-xs text-destructive">
          {issue.code === "target-shortfall" ? "Target shortfall" : "Missing input"}:{" "}
          {assets.catalog.items[issue.itemId!]?.name} · {Number(issue.perMinute?.toFixed(3))}
        </output>
      ))}
    </section>
  );
}

function ConstraintField({
  label,
  value,
  placeholder,
  max,
  onCommit,
}: {
  label: string;
  value?: number;
  placeholder: string;
  max: number;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  function commit() {
    const next = draft.trim() ? Number(draft) : null;
    if (next === null || (Number.isFinite(next) && next > 0 && next <= max)) onCommit(next);
    else setDraft(value === undefined ? "" : String(value));
  }
  return (
    <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
      <span>{label}</span>
      <div className="flex w-42 shrink-0 items-center gap-1">
        <Input
          aria-label={label}
          inputMode="decimal"
          value={draft}
          placeholder={placeholder}
          className="text-right tabular-nums"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {value !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Clear ${label}`}
            onClick={() => onCommit(null)}
          >
            Auto
          </Button>
        )}
      </div>
    </div>
  );
}
