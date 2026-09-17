/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Local drafts commit on blur or Enter. */
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
export function InspectorTextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const [source, setSource] = useState(value),
    [draft, setDraft] = useState<string | null>(null);
  if (source !== value) {
    setSource(value);
    setDraft(null);
  }
  function commit() {
    if (draft?.trim() && draft.trim() !== value) onCommit(draft.trim());
    setDraft(null);
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape" && draft !== null) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
    </div>
  );
}
