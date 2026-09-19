/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Controls belong to the selected group. */
import { flowOutputRates } from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { LockIcon, LockOpenIcon } from "lucide-react";
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
  const rates = flowOutputRates(node, assets.catalog);
  const locked = Object.keys(node.flow?.targets ?? {}).length > 0;
  const issues = editor
    .getFlowAnalysis()
    .issues.filter(
      (issue) =>
        issue.nodeId === node.id &&
        (issue.code === "missing-input" || issue.code === "target-shortfall"),
    );
  return (
    <section aria-label="Production rates" className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span>Output rates</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Lock production"
          aria-pressed={locked}
          title={
            locked
              ? "Unlock to follow the connected plan"
              : "Keep these output rates when other settings change"
          }
          disabled={!locked && !rates.some((rate) => (rate.perMinute ?? 0) > 0)}
          onClick={() => editor.setProductionLocked(node.id, !locked)}
        >
          {locked ? <LockIcon /> : <LockOpenIcon />}
          {locked ? "Locked" : "Unlocked"}
        </Button>
      </div>
      {rates.map((output) => (
        <RateField
          key={`${node.id}:${output.itemId}:${output.perMinute}:${locked}`}
          label={assets.catalog.items[output.itemId]!.name}
          value={output.perMinute}
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

function RateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number) => void;
}) {
  const formatted = value === null ? "" : String(Number(value.toFixed(3)));
  const [draft, setDraft] = useState(formatted);
  function commit() {
    // Focusing or tabbing through an automatic rate must not lock production.
    if (draft === formatted) return;
    const next = Number(draft);
    if (draft.trim() && Number.isFinite(next) && next > 0 && next <= 1e9) onCommit(next);
    else setDraft(formatted);
  }
  return (
    <label className="flex items-center justify-between gap-2 text-xs sm:text-sm">
      <span>{label}</span>
      <Input
        aria-label={`${label} output rate`}
        inputMode="decimal"
        value={draft}
        disabled={value === null}
        placeholder="Unknown"
        className="w-42 shrink-0 text-right tabular-nums"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
