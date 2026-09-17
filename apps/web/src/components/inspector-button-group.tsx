/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Small, selected-inspector option sets. */
import { useId } from "react";

import type { InspectorOption } from "@/components/inspector-choice";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export function InspectorButtonGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly InspectorOption[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <span id={id} className="text-xs sm:text-sm">
        {label}
        {value === null && <span className="ml-1 text-xs text-muted-foreground">· Mixed</span>}
      </span>
      <ButtonGroup aria-labelledby={id}>
        {options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={value === option.value ? "secondary" : "outline"}
            aria-pressed={value === option.value}
            disabled={typeof option.disabled === "function" ? option.disabled() : option.disabled}
            onClick={() => onChange(option.value)}
            className="min-h-11 px-2 sm:min-h-8"
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}
