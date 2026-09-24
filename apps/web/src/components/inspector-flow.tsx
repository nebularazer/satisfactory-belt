/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Controls belong to the selected group. */
import {
  flowOutputRates,
  flowMachineLimit,
  flowCapacityNode,
  resolveProduction,
  formatPlanningNumber,
  isProductionLocked,
} from "@satisfactory-belt/factory-core";
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
  const actual = resolveProduction(node, assets.catalog).outputs;
  const capacity =
    flowMachineLimit(node) === undefined
      ? null
      : resolveProduction(flowCapacityNode(node), assets.catalog).outputs;
  const locked = isProductionLocked(node);
  return (
    <section aria-label="Production rates" className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span>Machine capacity</span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Automatic machine sizing"
          title={
            flowMachineLimit(node) === undefined
              ? "Limit capacity to the current machine count"
              : "Use automatic machine sizing"
          }
          aria-pressed={flowMachineLimit(node) === undefined}
          onClick={() => editor.setAutomaticSizing(node.id, flowMachineLimit(node) !== undefined)}
        >
          {flowMachineLimit(node) === undefined
            ? "Auto"
            : `${flowMachineLimit(node)} ${flowMachineLimit(node) === 1 ? "machine" : "machines"}`}
        </Button>
      </div>
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
        <div key={output.itemId} className="space-y-1">
          <RateField
            key={`${node.id}:${output.itemId}:${output.perMinute}:${locked}`}
            label={assets.catalog.items[output.itemId]!.name}
            value={output.perMinute}
            onCommit={(value) => editor.setProductionTarget(node.id, output.itemId, value)}
          />
          {(capacity || locked) && (
            <p className="text-right text-xs text-muted-foreground">
              {formatPlanningNumber(
                actual.find((rate) => rate.itemId === output.itemId)?.perMinute ?? 0,
              )}
              /min used
              {capacity &&
                ` · ${formatPlanningNumber(capacity.find((rate) => rate.itemId === output.itemId)?.perMinute ?? 0)}/min capacity`}
            </p>
          )}
        </div>
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
