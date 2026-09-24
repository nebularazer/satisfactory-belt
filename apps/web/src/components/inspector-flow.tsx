/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Controls belong to the selected group. */
import {
  commonSetting,
  formatPlanningNumber,
  productionLimit,
  resolveProduction,
} from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import {
  ArrowUpToLineIcon,
  FactoryIcon,
  GaugeIcon,
  WandSparklesIcon,
  InfinityIcon,
  RotateCcwIcon,
} from "lucide-react";

import { InspectorNumberInput } from "@/components/inspector-number-field";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

const formatClock = (value: number) => formatPlanningNumber(value, "mixed");

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
        <div className="flex w-64 items-center gap-2">
          <InspectorNumberInput
            type="number"
            revision={node}
            className="w-auto min-w-0 flex-1 shrink"
            key={`${node.id}:${limit?.kind}:${limit?.value}`}
            label="Production limit"
            unit={limit?.kind === "output" ? "/min" : undefined}
            value={limit?.value ?? null}
            disabled={!limit}
            placeholder="No Limit"
            min={limit?.kind === "machines" ? 1 : 0.000001}
            max={limit?.kind === "machines" ? 10_000 : 1e9}
            integer={limit?.kind === "machines"}
            onCommit={(value) => limit && editor.setLimit(node.id, { ...limit, value })}
          />
          <ButtonGroup aria-label="Production limit controls">
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
              <InfinityIcon />
            </ModeButton>
          </ButtonGroup>
        </div>
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
        <div className="flex w-64 items-center gap-2">
          <InspectorNumberInput
            type={manual ? "number" : "text"}
            formatValue={formatClock}
            title={manual ? undefined : "Calculated automatically"}
            revision={node}
            className="w-auto min-w-0 flex-1 shrink"
            key={`${node.id}:${scope}:${manual}:${clock}`}
            label="Clock"
            value={clock}
            disabled={!manual}
            placeholder="Mixed"
            min={1}
            max={250}
            onCommit={(value) => editor.setClock(node.id, value, scope)}
          />
          <ButtonGroup aria-label="Clock controls">
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
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0 sm:size-8"
              aria-label="Reset clock to 100%"
              title="Reset clock to 100%"
              onClick={() => editor.setClock(node.id, 100, scope)}
            >
              <RotateCcwIcon />
            </Button>
          </ButtonGroup>
        </div>
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
