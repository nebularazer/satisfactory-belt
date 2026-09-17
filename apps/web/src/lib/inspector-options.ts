const labels = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Keep utility choices first in their declared order; sort the remaining labels naturally. */
export function sortInspectorOptions<T extends { value: string; label: string; pinned?: boolean }>(
  options: readonly T[],
): T[] {
  return options.toSorted((a, b) => {
    if (a.pinned || b.pinned) return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    return labels.compare(a.label, b.label) || labels.compare(a.value, b.value);
  });
}
