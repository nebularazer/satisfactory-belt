/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Handlers belong to this small controlled field. */
import { MinusIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Drafts never enter document history; a null value represents mixed settings. */
export function InspectorNumberField({
  label,
  value,
  revision,
  min,
  exclusiveMin = false,
  max,
  integer = false,
  unit,
  onCommit,
}: {
  label: string;
  value: number | null;
  revision: unknown;
  min: number;
  exclusiveMin?: boolean;
  max?: number;
  integer?: boolean;
  unit?: string;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [source, setSource] = useState(revision);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An external edit or undo wins over a draft, even when the displayed value stays Mixed.
  if (source !== revision) {
    setSource(revision);
    setDraft(null);
    setError(null);
  }
  function valid(number: number) {
    return (
      Number.isFinite(number) &&
      (exclusiveMin ? number > min : number >= min) &&
      (max === undefined || number <= max) &&
      (!integer || Number.isSafeInteger(number))
    );
  }
  function apply(number: number) {
    if (!valid(number)) {
      setError(
        `Enter ${integer ? "a whole number" : "a number"} ${max === undefined ? `${exclusiveMin ? "greater than" : "of at least"} ${min}` : `from ${min} to ${max}`}.`,
      );
      return;
    }
    try {
      onCommit(number);
      setDraft(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This value could not be applied.");
    }
  }
  function commit() {
    if (draft !== null) apply(draft.trim() ? Number(draft) : NaN);
  }
  const stepValue = draft === null ? value : draft.trim() ? Number(draft) : null;
  function canStep(delta: number) {
    return stepValue !== null && valid(stepValue) && valid(stepValue + delta);
  }
  function step(delta: number) {
    if (stepValue !== null && canStep(delta)) apply(stepValue + delta);
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] gap-1 sm:grid-cols-[2rem_minmax(0,1fr)_2rem]">
        <Button
          variant="outline"
          className="h-11 px-0 sm:h-8"
          aria-label={`Decrease ${label} by 1`}
          disabled={!canStep(-1)}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => step(-1)}
        >
          <MinusIcon />
        </Button>
        <Input
          id={id}
          inputMode={integer ? "numeric" : "decimal"}
          className="min-h-11 text-right tabular-nums sm:min-h-8"
          value={draft ?? (value === null ? "" : String(Number(value.toPrecision(12))))}
          placeholder={value === null ? "Mixed" : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
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
              setError(null);
            }
          }}
        />
        <Button
          variant="outline"
          className="h-11 px-0 sm:h-8"
          aria-label={`Increase ${label} by 1`}
          disabled={!canStep(1)}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => step(1)}
        >
          <PlusIcon />
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
