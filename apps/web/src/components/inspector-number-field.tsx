/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Handlers belong to this small controlled field. */
import { MinusIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

/** Drafts never enter document history; a null value represents mixed settings. */
export function InspectorNumberField({
  label,
  value,
  revision,
  min,
  max,
  integer = false,
  unit,
  onCommit,
}: {
  label: string;
  value: number | null;
  revision: unknown;
  min: number;
  max?: number;
  integer?: boolean;
  unit?: string;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [source, setSource] = useState(revision);
  const [draft, setDraft] = useState<string | null>(null);
  // An external edit or undo wins over a draft, even when the displayed value stays Mixed.
  if (source !== revision) {
    setSource(revision);
    setDraft(null);
  }
  function normalize(number: number) {
    const lower = integer ? Math.ceil(min) : min;
    const upper = integer
      ? Math.floor(Math.min(max ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))
      : (max ?? Number.MAX_VALUE);
    const clamped = Math.min(upper, Math.max(lower, integer ? Math.round(number) : number));
    return Number.isFinite(clamped) ? clamped : null;
  }
  function apply(number: number) {
    const normalized = normalize(number);
    if (normalized !== null) onCommit(normalized);
    // Empty or nonnumeric drafts restore the committed value (or Mixed).
    setDraft(null);
  }
  function commit() {
    if (draft !== null) apply(draft.trim() ? Number(draft) : NaN);
  }
  const stepValue = draft === null ? value : normalize(draft.trim() ? Number(draft) : NaN);
  function canStep(delta: number) {
    return stepValue !== null && normalize(stepValue + delta) !== stepValue;
  }
  function step(delta: number) {
    if (stepValue !== null && canStep(delta)) apply(stepValue + delta);
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="shrink-0 whitespace-nowrap text-xs sm:text-sm">
          {label}
        </label>
        <InputGroup className="h-11 max-w-44 min-w-0 flex-1 has-disabled:bg-transparent has-disabled:opacity-100 sm:h-8 dark:has-disabled:bg-input/30">
          <InputGroupInput
            id={id}
            inputMode={integer ? "numeric" : "decimal"}
            className="min-h-11 text-right tabular-nums sm:min-h-8"
            value={draft ?? (value === null ? "" : String(Number(value.toPrecision(12))))}
            placeholder={value === null ? "Mixed" : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                step(event.key === "ArrowUp" ? 1 : -1);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape" && draft !== null) {
                event.preventDefault();
                event.stopPropagation();
                setDraft(null);
              }
            }}
          />
          <InputGroupAddon align="inline-start" className="py-0">
            <InputGroupButton
              size="icon-xs"
              className="h-9 w-7 sm:size-6"
              aria-label={`Decrease ${label} by 1`}
              disabled={!canStep(-1)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => step(-1)}
            >
              <MinusIcon />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupAddon align="inline-end" className="gap-1 py-0">
            {unit && <InputGroupText className="text-xs">{unit}</InputGroupText>}
            <InputGroupButton
              size="icon-xs"
              className="h-9 w-7 sm:size-6"
              aria-label={`Increase ${label} by 1`}
              disabled={!canStep(1)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => step(1)}
            >
              <PlusIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}
