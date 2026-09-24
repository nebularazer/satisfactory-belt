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
  PercentIcon,
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
        <span className="w-14 shrink-0">Limit</span>
        <div className="flex w-64 min-w-0 items-center gap-2">
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
              label="Output /min"
              selected={limit?.kind === "output"}
              onClick={() => outputId && editor.convertLimit(node.id, outputId)}
            >
              <ArrowUpToLineIcon />
            </ModeButton>
            <ModeButton
              label="Machine count"
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
                  className="w-55 justify-between font-normal"
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
        <span className="w-14 shrink-0">Clock %</span>
        <div className="flex w-64 min-w-0 items-center gap-2">
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
              label="Set clock"
              selected={manual}
              onClick={() => editor.setClock(node.id, node.flow?.clockPercent ?? 100, scope)}
            >
              <GaugeIcon />
            </ModeButton>
            <ModeButton
              label="Auto clock"
              description="Adjust clock speed to the required flow using whole machines."
              selected={!manual}
              disabled={scope !== "all"}
              onClick={() => editor.setClock(node.id, null)}
            >
              <WandSparklesIcon />
            </ModeButton>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label="Set 100%"
              title="Set 100%"
              onClick={() => editor.setClock(node.id, 100, scope)}
            >
              <PercentIcon />
            </Button>
          </ButtonGroup>
        </div>
      </div>
    </section>
  );
}

function ModeButton({
  label,
  description,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="shrink-0 aria-pressed:bg-muted"
      aria-label={label}
      title={description ? `${label}: ${description}` : label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={selected ? undefined : onClick}
    >
      {children}
    </Button>
  );
}
