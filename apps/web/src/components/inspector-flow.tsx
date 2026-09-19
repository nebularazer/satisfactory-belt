/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Controls belong to the selected group. */
import { flowOutputRates, formatPlanningNumber } from "@satisfactory-belt/factory-core";
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
          {assets.catalog.items[issue.itemId!]?.name} ·{" "}
          {issue.perMinute == null ? "—" : formatPlanningNumber(issue.perMinute)}
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
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    // Display formatting and focus must never change precision or lock automatic production.
    if (draft === null) return;
    const next = Number(draft);
    if (draft.trim() && Number.isFinite(next) && next > 0 && next <= 1e9 && next !== value)
      onCommit(next);
    setDraft(null);
  }
  return (
    <label className="flex items-center justify-between gap-2 text-xs sm:text-sm">
      <span>{label}</span>
      <Input
        aria-label={`${label} output rate`}
        inputMode="decimal"
        value={
          draft ?? (value === null ? "" : focused ? String(value) : formatPlanningNumber(value))
        }
        disabled={value === null}
        placeholder="Unknown"
        className="w-42 shrink-0 text-right tabular-nums"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
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
