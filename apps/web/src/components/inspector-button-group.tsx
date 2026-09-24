/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Small option sets and Base UI render composition. */
import type { ReactNode } from "react";
import { useId } from "react";

import type { InspectorOption } from "@/components/inspector-choice";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function InspectorButtonGroup({
  label,
  value,
  options,
  onChange,
  iconOnly = false,
  disabled: groupDisabled = false,
}: {
  label: string;
  value: string | null;
  options: readonly (InspectorOption & { icon?: ReactNode })[];
  iconOnly?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <span id={id} className="text-xs sm:text-sm">
        {label}
        {value === null && <span className="ml-1 text-xs text-muted-foreground">· Mixed</span>}
      </span>
      <ButtonGroup aria-labelledby={id} className={iconOnly ? "w-55 shrink-0" : "w-42 shrink-0"}>
        {options.map((option) => {
          const disabled =
            groupDisabled ||
            (typeof option.disabled === "function" ? option.disabled() : option.disabled);
          const button = (
            <Button
              key={option.value}
              size="sm"
              variant={value === option.value ? "secondary" : "outline"}
              aria-label={iconOnly ? option.label : undefined}
              aria-pressed={value === option.value}
              disabled={disabled}
              focusableWhenDisabled={iconOnly}
              onClick={() => onChange(option.value)}
              className={
                iconOnly
                  ? "min-h-11 min-w-0 flex-1 px-1 data-disabled:pointer-events-auto data-disabled:opacity-50 sm:min-h-8"
                  : "min-h-11 min-w-0 flex-1 px-2 sm:min-h-8"
              }
            >
              {iconOnly ? option.icon : option.label}
            </Button>
          );
          return iconOnly ? (
            <Tooltip key={option.value}>
              <TooltipTrigger render={button} />
              <TooltipContent>
                {option.label}
                {disabled && " · Incompatible with existing connections"}
              </TooltipContent>
            </Tooltip>
          ) : (
            button
          );
        })}
      </ButtonGroup>
    </div>
  );
}
