/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Controls belong to the selected group. */
import { commonSetting, productionLimit, resolveProduction } from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { ArrowUpToLineIcon, FactoryIcon, GaugeIcon, WandSparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
  const outputId = limit?.kind === "output" ? limit.itemId : outputs[0]?.itemId;
  return (
    <section aria-label="Production controls" className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>Limit</span>
        <ButtonGroup className="w-55" aria-label="Production limit controls">
          <NumberInput
            key={`${node.id}:${limit?.kind}:${limit?.value}`}
            label="Production limit"
            value={limit?.value ?? null}
            disabled={!limit}
            placeholder="No Limit"
            min={limit?.kind === "machines" ? 1 : 0.000001}
            max={limit?.kind === "machines" ? 10_000 : 1e9}
            integer={limit?.kind === "machines"}
            onCommit={(value) => limit && editor.setLimit(node.id, { ...limit, value })}
          />
          <ModeButton
            label="Limit output per minute"
            selected={limit?.kind === "output"}
            onClick={() => outputId && editor.convertLimit(node.id, outputId)}
          >
            <ArrowUpToLineIcon />
          </ModeButton>
          <ModeButton
            label="Limit machines"
            selected={limit?.kind === "machines"}
            onClick={() => editor.convertLimit(node.id, "machines")}
          >
            <FactoryIcon />
          </ModeButton>
          <ModeButton
            label="No limit"
            selected={!limit}
            onClick={() => editor.setLimit(node.id, null)}
          >
            <XIcon />
          </ModeButton>
        </ButtonGroup>
      </div>
      {limit?.kind === "output" && outputs.length > 1 && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  aria-label="Output limit item"
                  className="h-11 w-55 justify-between font-normal sm:h-8"
                />
              }
            >
              {assets.catalog.items[limit.itemId]!.name}/min
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>Clock %</span>
        <ButtonGroup className="w-55" aria-label="Clock controls">
          <NumberInput
            key={`${node.id}:${scope}:${manual}:${clock}`}
            label="Clock"
            value={manual ? clock : null}
            disabled={!manual}
            placeholder={manual ? "Mixed" : "Auto"}
            min={1}
            max={250}
            onCommit={(value) => editor.setClock(node.id, value, scope)}
          />
          <ModeButton
            label="Use manual clock"
            selected={manual}
            onClick={() => editor.setClock(node.id, node.flow?.clockPercent ?? 100, scope)}
          >
            <GaugeIcon />
          </ModeButton>
          <ModeButton
            label="Use automatic clock"
            selected={!manual}
            disabled={scope !== "all"}
            onClick={() => editor.setClock(node.id, null)}
          >
            <WandSparklesIcon />
          </ModeButton>
        </ButtonGroup>
      </div>
    </section>
  );
}

function ModeButton({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-11 shrink-0 aria-pressed:bg-muted sm:size-8"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={selected ? undefined : onClick}
    >
      {children}
    </Button>
  );
}

function NumberInput({
  value,
  label,
  placeholder,
  disabled,
  min,
  max,
  integer,
  onCommit,
}: {
  value: number | null;
  label: string;
  placeholder: string;
  disabled?: boolean;
  min: number;
  max: number;
  integer?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft === null) return;
    const next = Number(draft);
    if (
      draft.trim() &&
      Number.isFinite(next) &&
      next >= min &&
      next <= max &&
      (!integer || Number.isInteger(next)) &&
      next !== value
    )
      onCommit(next);
    setDraft(null);
  }
  return (
    <Input
      type="number"
      aria-label={label}
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={integer ? 1 : "any"}
      disabled={disabled}
      placeholder={placeholder}
      className="h-11 min-w-0 text-right tabular-nums sm:h-8"
      value={draft ?? value ?? ""}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
