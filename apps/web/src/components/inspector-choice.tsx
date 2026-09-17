/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Choices are scoped to the selected inspector. */
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxTrigger,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import type { GameAssets } from "@/lib/game-assets";

export type InspectorOption = {
  value: string;
  label: string;
  disabled?: boolean | (() => boolean);
  iconId?: string;
  description?: string;
  badge?: string;
  hideDisabledBadge?: boolean;
};
const labelFor = (option: InspectorOption) => option.label;
const isDisabled = (option: InspectorOption) =>
  typeof option.disabled === "function" ? option.disabled() : option.disabled;
const valueFor = (option: InspectorOption) => option.value;
export function InspectorChoice({
  label,
  value,
  options,
  onChange,
  assets,
  description,
  disabled = false,
  inline = false,
  hideLabel = false,
  showSelectedIcon = false,
  inputAction,
}: {
  label: string;
  value: string | null;
  options: readonly InspectorOption[];
  onChange: (value: string) => void;
  assets?: GameAssets;
  description?: string;
  disabled?: boolean;
  inline?: boolean;
  hideLabel?: boolean;
  showSelectedIcon?: boolean;
  inputAction?: ReactNode;
}) {
  const id = useId();
  const anchor = useComboboxAnchor();
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  return (
    <div
      className={
        inline ? "flex items-center justify-between gap-2" : hideLabel ? "" : "space-y-1.5"
      }
    >
      <label
        id={`${id}-label`}
        htmlFor={id}
        className={
          hideLabel
            ? "sr-only"
            : inline
              ? "text-xs sm:text-sm"
              : "text-xs font-medium text-muted-foreground"
        }
      >
        {label}
      </label>
      <Combobox
        disabled={disabled}
        items={options}
        value={selected ?? null}
        inputValue={query}
        onInputValueChange={setQuery}
        onOpenChange={(open) => {
          if (open) setQuery("");
        }}
        itemToStringLabel={labelFor}
        itemToStringValue={valueFor}
        onValueChange={(option) => {
          if (option && !isDisabled(option)) onChange(option.value);
        }}
      >
        <InputGroup
          ref={anchor}
          className={`${inline ? "w-55 min-w-0 shrink-0" : "w-full"} has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${inputAction && !disabled ? "has-disabled:bg-transparent has-disabled:opacity-100 dark:has-disabled:bg-input/30" : ""}`}
        >
          <ComboboxTrigger
            id={id}
            disabled={disabled}
            aria-labelledby={`${id}-label ${id}-value`}
            className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-sm outline-none [&>svg]:shrink-0"
          >
            {showSelectedIcon && selected?.iconId && assets && (
              <CatalogIcon iconId={selected.iconId} assets={assets} size={24} />
            )}
            <span
              id={`${id}-value`}
              className={`min-w-0 flex-1 truncate ${selected ? "" : "text-muted-foreground"}`}
            >
              {selected?.label ?? (value === null ? "Mixed" : "Choose…")}
            </span>
          </ComboboxTrigger>
          {inputAction && <InputGroupAddon align="inline-end">{inputAction}</InputGroupAddon>}
        </InputGroup>
        <ComboboxContent
          anchor={anchor}
          align="start"
          className="min-w-0"
          initialFocus={searchInput}
          aria-label={`${label} options`}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <ComboboxInput
            ref={searchInput}
            aria-label={`Search ${label}`}
            placeholder="Search…"
            showTrigger={false}
          />
          <ComboboxEmpty>No matches.</ComboboxEmpty>
          <ComboboxList>
            {(option: InspectorOption) => (
              <InspectorChoiceItem key={option.value} option={option} assets={assets} />
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function InspectorChoiceItem({ option, assets }: { option: InspectorOption; assets?: GameAssets }) {
  const incompatible = isDisabled(option);
  return (
    <ComboboxItem value={option} disabled={incompatible} className="min-h-11 sm:min-h-9">
      {assets && option.iconId && <CatalogIcon iconId={option.iconId} assets={assets} size={24} />}
      <span className="min-w-0 flex-1 whitespace-normal">
        {option.label}
        {option.description && (
          <span className="block text-xs text-muted-foreground">{option.description}</span>
        )}
      </span>
      {option.badge && <Badge variant="secondary">{option.badge}</Badge>}
      {incompatible && !option.hideDisabledBadge && (
        <Badge variant="outline" title="Doesn’t support the existing connections or configuration">
          Incompatible
        </Badge>
      )}
    </ComboboxItem>
  );
}
