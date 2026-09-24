/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Controls belong to the selected group. */
import {
  commonSetting,
  formatPlanningNumber,
  productionLimit,
  resolveProduction,
} from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { InspectorNumberField } from "@/components/inspector-number-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Props = {
  node: FlowGroup;
  scope?: string;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
};
export function InspectorFlow({ node, editor, assets, scope = "all" }: Props) {
  const limit = productionLimit(node);
  const outputs = resolveProduction(node, assets.catalog).outputs;
  const manual = node.flow?.clockMode === "manual" || scope !== "all";
  const scopedMembers =
    scope === "all" ? node.machines : node.machines.filter((member) => member.id === scope);
  const clock = commonSetting(scopedMembers, "clockPercent");
  const unit =
    limit?.kind === "machines"
      ? "machines"
      : limit?.kind === "output"
        ? outputs.length > 1
          ? `${assets.catalog.items[limit.itemId]!.name}/min`
          : "output/min"
        : "No limit";
  return (
    <section aria-label="Production controls" className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>Limit</span>
        <div className="flex w-55 min-w-0 items-center gap-1">
          {limit && (
            <LimitInput
              key={`${node.id}:${limit.kind}:${limit.value}`}
              value={limit.value}
              integer={limit.kind === "machines"}
              onCommit={(value) =>
                editor.setLimit(node.id, value === null ? null : { ...limit, value })
              }
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  aria-label="Limit unit"
                  className="h-11 min-w-0 flex-1 justify-between font-normal sm:h-8"
                />
              }
            >
              <span className="truncate">{unit}</span>
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => editor.setLimit(node.id, null)}>
                No limit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.convertLimit(node.id, "machines")}>
                Machines
              </DropdownMenuItem>
              {outputs.map((output) => (
                <DropdownMenuItem
                  key={output.itemId}
                  onClick={() => editor.convertLimit(node.id, output.itemId)}
                >
                  {assets.catalog.items[output.itemId]!.name}/min
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {limit && (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              aria-label="Clear limit"
              onClick={() => editor.setLimit(node.id, null)}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {manual ? (
        <InspectorNumberField
          label="Clock"
          key={scope}
          value={clock}
          revision={node}
          min={1}
          max={250}
          unit="%"
          onCommit={(value) => editor.setClock(node.id, value, scope)}
          labelHint={
            scope === "all" ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Use automatic clock"
                onClick={() => editor.setClock(node.id, null)}
              >
                Auto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Clock</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  aria-label="Clock mode"
                  className="h-11 w-55 justify-between font-normal sm:h-8"
                />
              }
            >
              Auto
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => editor.setClock(node.id, null)}>
                Auto
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.setClock(node.id, node.flow?.clockPercent ?? 100)}
              >
                Manual
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </section>
  );
}

function LimitInput({
  value,
  integer,
  onCommit,
}: {
  value: number;
  integer: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  function commit() {
    if (draft === null) return;
    const next = Number(draft);
    if (!draft.trim()) onCommit(null);
    else if (
      Number.isFinite(next) &&
      next > 0 &&
      next <= (integer ? 10_000 : 1e9) &&
      (!integer || Number.isInteger(next)) &&
      next !== value
    )
      onCommit(next);
    setDraft(null);
  }
  return (
    <Input
      aria-label="Production limit"
      inputMode={integer ? "numeric" : "decimal"}
      className="h-11 w-16 shrink-0 text-right tabular-nums sm:h-8"
      value={draft ?? (focused ? String(value) : formatPlanningNumber(value))}
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
        if (event.key === "Escape") {
          event.stopPropagation();
          setDraft(null);
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const next =
            (draft === null ? value : Number(draft)) + (event.key === "ArrowUp" ? 1 : -1);
          if (
            Number.isFinite(next) &&
            next > 0 &&
            next <= (integer ? 10_000 : 1e9) &&
            (!integer || Number.isInteger(next))
          ) {
            onCommit(next);
            setDraft(null);
          }
        }
      }}
    />
  );
}
