/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Choices are scoped to the selected inspector. */
import { useId, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { sortInspectorOptions } from "@/lib/inspector-options";

export type InspectorOption = {
  value: string;
  label: string;
  disabled?: boolean | (() => boolean);
  iconId?: string;
  description?: string;
  badge?: string;
  hideDisabledBadge?: boolean;
  pinned?: boolean;
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
  inputAction?: ReactNode;
}) {
  const id = useId();
  const anchor = useComboboxAnchor();
  const searchInput = useRef<HTMLInputElement>(null);
  const sortedOptions = useMemo(() => sortInspectorOptions(options), [options]);
  const selected = options.find((option) => option.value === value);
  const trigger = (
    <ComboboxTrigger
      id={id}
      disabled={disabled}
      aria-labelledby={`${id}-label ${id}-value`}
      render={
        <Button
          variant={inputAction ? "ghost" : "outline"}
          className={
            inputAction
              ? "h-full min-w-0 flex-1 justify-between font-normal"
              : "h-11 w-full min-w-0 justify-between font-normal sm:h-8"
          }
        />
      }
    >
      {selected?.iconId && assets && (
        <CatalogIcon iconId={selected.iconId} assets={assets} size={24} />
      )}
      <span
        id={`${id}-value`}
        className={`min-w-0 flex-1 truncate text-left ${selected ? "" : "text-muted-foreground"}`}
      >
        {selected?.label ?? (value === null ? "Mixed" : "Choose…")}
      </span>
    </ComboboxTrigger>
  );
  const width = inline ? "w-55 min-w-0 shrink-0" : "w-full";
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
        items={sortedOptions}
        value={selected ?? null}
        itemToStringLabel={labelFor}
        itemToStringValue={valueFor}
        onValueChange={(option) => {
          if (option && !isDisabled(option)) onChange(option.value);
        }}
      >
        {inputAction ? (
          <InputGroup
            ref={anchor}
            className={`${width} h-11 sm:h-8 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${!disabled ? "has-disabled:bg-transparent has-disabled:opacity-100 dark:has-disabled:bg-input/30" : ""}`}
          >
            {trigger}
            <InputGroupAddon align="inline-end">{inputAction}</InputGroupAddon>
          </InputGroup>
        ) : (
          <div ref={anchor} className={width}>
            {trigger}
          </div>
        )}
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
            placeholder="Search"
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
    <ComboboxItem value={option} disabled={incompatible}>
      {assets && option.iconId && <CatalogIcon iconId={option.iconId} assets={assets} size={16} />}
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
