/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Small, selected-inspector option sets. */
import type { ReactNode } from "react";
import { useId } from "react";

import type { InspectorOption } from "@/components/inspector-choice";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export function InspectorButtonGroup({
  label,
  value,
  options,
  onChange,
  iconOnly = false,
}: {
  label: string;
  value: string | null;
  options: readonly (InspectorOption & { icon?: ReactNode })[];
  iconOnly?: boolean;
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
            typeof option.disabled === "function" ? option.disabled() : option.disabled;
          return (
            <Button
              key={option.value}
              size="sm"
              variant={value === option.value ? "secondary" : "outline"}
              aria-label={iconOnly ? option.label : undefined}
              title={
                iconOnly
                  ? `${option.label}${disabled ? " · Incompatible with existing connections" : ""}`
                  : undefined
              }
              aria-pressed={value === option.value}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={
                iconOnly
                  ? "min-h-11 min-w-0 flex-1 px-1 sm:min-h-8"
                  : "min-h-11 min-w-0 flex-1 px-2 sm:min-h-8"
              }
            >
              {iconOnly ? option.icon : option.label}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}
