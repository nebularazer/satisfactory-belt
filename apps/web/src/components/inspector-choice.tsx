/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Choices are scoped to the selected inspector. */
import { useId } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
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
}: {
  label: string;
  value: string | null;
  options: readonly InspectorOption[];
  onChange: (value: string) => void;
  assets?: GameAssets;
  description?: string;
  disabled?: boolean;
  inline?: boolean;
}) {
  const id = useId();
  return (
    <div className={inline ? "flex items-center justify-between gap-2" : "space-y-1.5"}>
      <label
        htmlFor={id}
        className={inline ? "text-xs sm:text-sm" : "text-xs font-medium text-muted-foreground"}
      >
        {label}
      </label>
      <Combobox
        disabled={disabled}
        items={options}
        value={options.find((option) => option.value === value) ?? null}
        itemToStringLabel={labelFor}
        itemToStringValue={valueFor}
        onValueChange={(option) => {
          if (option && !isDisabled(option)) onChange(option.value);
        }}
      >
        <ComboboxInput
          id={id}
          disabled={disabled}
          placeholder={value === null ? "Mixed" : "Choose…"}
          className={inline ? "w-55 min-w-0 shrink-0" : "w-full"}
        />
        <ComboboxContent onKeyDown={(event) => event.stopPropagation()}>
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
