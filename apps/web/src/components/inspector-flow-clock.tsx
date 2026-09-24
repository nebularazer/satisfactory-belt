/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-jsx-as-prop -- Selected group controls. */
import {
  commonSetting,
  isProductionLocked,
  rebalanceFlowGroup,
  MAX_MACHINE_COUNT,
} from "@satisfactory-belt/factory-core";
import type { FlowGroup } from "@satisfactory-belt/factory-core";
import { InfoIcon } from "lucide-react";
import { useId, useState } from "react";

import { InspectorNumberField } from "@/components/inspector-number-field";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

export function InspectorFlowClock({
  node,
  editor,
  assets,
}: {
  node: FlowGroup;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const count = node.machines.length;
  const locked = isProductionLocked(node);
  const more =
    locked &&
    count < MAX_MACHINE_COUNT &&
    Boolean(rebalanceFlowGroup(node, assets.catalog, count + 1));
  const fewer = locked && count > 1 && Boolean(rebalanceFlowGroup(node, assets.catalog, count - 1));
  return (
    <div className="space-y-2">
      <InspectorNumberField
        label="Clock speed"
        value={commonSetting(node.machines, "clockPercent")}
        revision={node}
        min={1}
        max={250}
        unit="%"
        onCommit={(value) => editor.setFlowClock(node.id, value)}
        steps={
          locked
            ? {
                decrease: {
                  label: "Lower clock: add one machine",
                  disabled: !more,
                  run: () => editor.setMachineCount(node.id, count + 1),
                },
                increase: {
                  label: "Raise clock: remove one machine",
                  disabled: !fewer,
                  run: () => editor.setMachineCount(node.id, count - 1),
                },
              }
            : undefined
        }
        labelHint={
          <Tooltip triggerId={helpId} open={helpOpen} onOpenChange={setHelpOpen}>
            <TooltipTrigger
              id={helpId}
              aria-describedby={helpOpen ? `${helpId}-description` : undefined}
              closeOnClick={false}
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="How clock speed works"
                  onClick={() => setHelpOpen(true)}
                />
              }
            >
              <InfoIcon />
            </TooltipTrigger>
            <TooltipContent
              role="tooltip"
              id={`${helpId}-description`}
              side="bottom"
              className="block space-y-2 leading-relaxed"
            >
              <p>
                The field shows the actual clock speed for the whole group. With output unlocked,
                changing clock speed updates its ceiling. + and − change the clock by one percentage
                point. Count buttons set a fixed machine capacity. Connected groups use only the
                capacity their suppliers and consumers allow.
              </p>
              <p>
                With output locked, − adds one machine and lowers the clock. + removes one machine
                and raises the clock, up to 250%. Arrow keys do the same.
              </p>
              <p>
                When output is locked and you type a percentage, we use the fewest whole machines
                that can meet the output at or below that speed, then adjust the clock to match
                exactly.
              </p>
              <p>
                Example: 300 ore with miners rated at 120 needs 3 miners at 83⅓%, even if you enter
                100%.
              </p>
              <p>
                Rebalance at 100% preserves production and sets a whole-machine capacity without
                overclocking. None of these actions changes the production lock.
              </p>
            </TooltipContent>
          </Tooltip>
        }
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground" aria-label="Group machine count">
          {count} {count === 1 ? "machine" : "machines"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="w-42 shrink-0"
          onClick={() => editor.rebalanceAt100(node.id)}
        >
          Rebalance at 100%
        </Button>
      </div>
    </div>
  );
}
