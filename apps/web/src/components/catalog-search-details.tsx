/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-object-as-prop, react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-function-as-prop -- The virtual window bounds icons; fallback state changes only after image errors. */
import type { Ingredient } from "@satisfactory-belt/game-data";
import { recipeAlternatives, compareRecipes } from "@satisfactory-belt/game-data/search";
import type { RecipeComparison, SearchEntry } from "@satisfactory-belt/game-data/search";
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  BoxesIcon,
  DropletsIcon,
  FactoryIcon,
  GitBranchIcon,
  ImageOffIcon,
  MinusIcon,
  PlusIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GameAssets } from "@/lib/game-assets";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

export function CatalogIcon({
  iconId,
  assets,
  size = 32,
}: {
  iconId: string;
  assets: GameAssets;
  size?: 16 | 24 | 32 | 64;
}) {
  const icon = assets.icons.icons[iconId];
  const sizes = size === 64 ? ([128, 256, 64] as const) : ([64, 128, 256] as const);
  const sources = icon
    ? sizes.map((variantSize) => new URL(icon.variants[variantSize].path, assets.baseUrl).href)
    : [];
  // Reset failed-image state when the requested asset changes (including hot reloads).
  return <CatalogImage key={sources.join("|")} sources={sources} size={size} />;
}

function CatalogImage({ sources, size }: { sources: readonly string[]; size: number }) {
  const [variant, setVariant] = useState(0);
  const src = sources[variant];
  const className =
    size === 64
      ? "size-16 shrink-0 object-contain"
      : size === 16
        ? "size-4 shrink-0 object-contain"
        : size === 24
          ? "size-6 shrink-0 object-contain"
          : "size-8 shrink-0 object-contain";
  if (!src)
    return <ImageOffIcon aria-hidden="true" className={`${className} text-muted-foreground`} />;
  // Try the next prepared size on failure instead of permanently hiding the image.
  return (
    <img
      key={src}
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setVariant((current) => current + 1)}
    />
  );
}

export function CatalogSearchDetails({
  entry,
  assets,
  machineId,
  index,
  onDetails,
  onPlace,
  allowedEntryIds,
  panelRef,
}: {
  entry: SearchEntry;
  assets: GameAssets;
  machineId?: string;
  index: readonly SearchEntry[];
  onDetails: (entry: SearchEntry) => void;
  onPlace?: (entry: SearchEntry) => void;
  allowedEntryIds?: ReadonlySet<string>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { catalog } = assets;
  const recipe = entry.kind === "recipe" ? catalog.recipes[entry.entityId] : undefined;
  const recipeMachineId =
    recipe && machineId && recipe.machineIds.includes(machineId)
      ? machineId
      : recipe?.machineIds[0];
  const machine = recipeMachineId ? catalog.machines[recipeMachineId] : undefined;
  const cycles = recipe && machine ? (60 * machine.manufacturingSpeed) / recipe.durationSeconds : 0;
  const alternativeIds = recipe ? new Set(recipeAlternatives(catalog, recipe.id)) : null;
  const related = index.filter((candidate) =>
    alternativeIds
      ? candidate.kind === "recipe" && alternativeIds.has(candidate.entityId)
      : entry.kind === "machine"
        ? candidate.kind === "recipe" && candidate.machineIds.includes(entry.entityId)
        : entry.kind === "extractor"
          ? candidate.kind === "resource" && candidate.extractorId === entry.entityId
          : false,
  );
  function quantities(title: string, entries: readonly Ingredient[], cyclesPerMinute: number) {
    return (
      <section className="h-36 space-y-2 overflow-y-auto overscroll-contain">
        <h4 className="text-sm font-medium">{title}</h4>
        <ul className="space-y-1.5">
          {entries.map((quantity) => {
            const item = catalog.items[quantity.itemId]!;
            return (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <CatalogIcon iconId={item.iconId} assets={assets} size={24} />
                <span className="min-w-0 flex-1">{item.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {number.format(quantity.amount * cyclesPerMinute)}
                  {item.unit === "m3" ? " m³/min" : "/min"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const producer =
    entry.kind === "fixed-producer" ? catalog.fixedProducers[entry.entityId] : undefined;
  const sink = entry.kind === "sink" ? catalog.sinks[entry.entityId] : undefined;
  const part = entry.kind === "logistics" ? catalog.logistics[entry.entityId] : undefined;
  const resource = entry.kind === "resource" ? catalog.items[entry.entityId] : undefined;
  const extractor = entry.extractorId ? catalog.extractors[entry.extractorId] : undefined;
  const buildingName =
    catalog.buildings?.[entry.entityId]?.name ??
    machine?.name ??
    extractor?.name ??
    producer?.name ??
    sink?.name ??
    part?.name ??
    entry.name;
  const description =
    catalog.buildings?.[entry.entityId]?.description ??
    producer?.description ??
    sink?.description ??
    part?.description ??
    resource?.description;
  const hasRelated = Boolean(recipe || entry.kind === "machine" || entry.kind === "extractor");
  return (
    <TooltipProvider delay={700} closeDelay={0} timeout={0}>
      <div
        ref={panelRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        <div className="shrink-0">
          <div className="px-4 pb-4">
            {description && (
              <p className="mb-5 whitespace-pre-line text-sm text-muted-foreground">
                {description}
              </p>
            )}
            {recipe && (
              <div className="grid gap-4 sm:grid-cols-2">
                {quantities("Inputs", recipe.ingredients, cycles)}
                {quantities("Outputs", recipe.products, cycles)}
              </div>
            )}
            {producer && (
              <p className="text-sm">
                {number.format(producer.powerMegawatts)} MW ·{" "}
                {number.format((producer.products[0]!.amount * 60) / producer.durationSeconds)}/min
              </p>
            )}
            {producer && (
              <div className="mt-4">
                {quantities("Outputs", producer.products, 60 / producer.durationSeconds)}
              </div>
            )}
            {sink && <p className="text-sm">{number.format(sink.powerMegawatts)} MW</p>}
            {extractor && (
              <p className="text-sm">
                {extractor.name} · {number.format(extractor.powerMegawatts)} MW
              </p>
            )}
          </div>
        </div>
        {onPlace && entry.kind !== "machine" && entry.kind !== "extractor" && (
          <div className="shrink-0 px-4 py-3">
            <Button
              className="w-full"
              disabled={Boolean(allowedEntryIds && !allowedEntryIds.has(entry.id))}
              onClick={() => onPlace(entry)}
            >
              <PlusIcon aria-hidden="true" /> Place {buildingName}
            </Button>
          </div>
        )}
        {hasRelated && (
          <section className="flex min-h-32 flex-1 flex-col border-t">
            <h4 className="shrink-0 px-4 pt-3 pb-2 text-sm font-medium">
              {recipe ? "Alternative recipes" : entry.kind === "machine" ? "Recipes" : "Resources"}
            </h4>
            <ScrollArea className="min-h-0 flex-1">
              {related.length ? (
                <ul className="space-y-1 px-4 pb-4">
                  {related.map((candidate) => {
                    const disabled = Boolean(allowedEntryIds && !allowedEntryIds.has(candidate.id));
                    const comparison = recipe
                      ? compareRecipes(catalog, recipe.id, candidate.entityId, recipeMachineId)
                      : undefined;
                    return (
                      <li
                        key={candidate.id}
                        className={
                          disabled
                            ? "relative rounded-md opacity-50 grayscale"
                            : "relative rounded-md has-[[data-catalog-related]:focus-visible]:bg-accent"
                        }
                      >
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          data-catalog-related=""
                          className="absolute inset-0 h-full w-full rounded-md hover:bg-accent focus-visible:border-transparent focus-visible:bg-accent focus-visible:ring-0"
                          aria-label={`Details for ${candidate.name}`}
                          onClick={() => onDetails(candidate)}
                        />
                        <div className="pointer-events-none relative flex min-h-12 items-center gap-3 px-2 py-2 text-sm font-medium">
                          <CatalogIcon assets={assets} iconId={candidate.iconId} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span>{candidate.name}</span>
                              {candidate.alternate && <Badge variant="secondary">Alternate</Badge>}
                              {disabled && (
                                <Badge variant="outline" title="Doesn’t support this connection">
                                  Incompatible
                                </Badge>
                              )}
                            </span>
                            <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                              {candidate.subtitle}
                            </span>
                          </span>
                        </div>
                        {comparison && (
                          <span className="pointer-events-none relative ml-13 mr-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2 text-xs font-normal tabular-nums text-muted-foreground">
                            <ComparisonMetric
                              kind="machines"
                              disabled={disabled}
                              onSelect={() => onDetails(candidate)}
                              value={comparison.machines}
                              baseline={1}
                            />
                            <ComparisonMetric
                              kind="power"
                              disabled={disabled}
                              onSelect={() => onDetails(candidate)}
                              value={comparison.powerMegawatts}
                              baseline={comparison.baselinePowerMegawatts}
                            />
                            <ComparisonMetric
                              kind="inputs"
                              disabled={disabled}
                              onSelect={() => onDetails(candidate)}
                              value={comparison.inputTypes}
                              baseline={comparison.baselineInputTypes}
                            />
                            <AdditionalRecipeMetrics
                              comparison={comparison}
                              assets={assets}
                              disabled={disabled}
                              onSelect={() => onDetails(candidate)}
                            />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-sm text-muted-foreground">No alternative recipes.</p>
              )}
            </ScrollArea>
          </section>
        )}
        <p className="hidden shrink-0 border-t px-4 py-2 text-xs text-muted-foreground sm:block">
          ↑ ↓ Navigate · Enter Open · Alt+← Back · Esc Close
        </p>
      </div>
    </TooltipProvider>
  );
}

function ComparisonMetric({
  kind,
  value,
  baseline,
  onSelect,
  disabled,
}: {
  kind: "machines" | "power" | "inputs";
  value: number | null;
  baseline: number | null;
  onSelect: () => void;
  disabled?: boolean;
}) {
  // Compare at the displayed precision so visually equal values receive the same color.
  const difference =
    value !== null && baseline !== null
      ? Math.round(value * 100) - Math.round(baseline * 100)
      : null;
  const relation =
    difference === null
      ? "comparison unavailable"
      : difference < 0
        ? "less"
        : difference > 0
          ? "more"
          : "same";
  const color =
    difference === null || difference === 0
      ? "text-muted-foreground"
      : difference < 0
        ? "text-emerald-700/80 dark:text-emerald-400/70"
        : "text-amber-700/80 dark:text-amber-400/70";
  const label = kind === "machines" ? "Machines" : kind === "power" ? "Power" : "Input types";
  const formatted =
    value === null ? "Variable" : `${number.format(value)}${kind === "power" ? " MW" : ""}`;
  const description = `${label}: ${formatted}; ${relation}${difference !== null ? `${difference === 0 ? " as" : " than"} selected recipe at equal output` : ""}`;
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={<button type="button" disabled={disabled} aria-label={description} />}
        className="pointer-events-auto inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={description}
        disabled={disabled}
        onClick={disabled ? undefined : onSelect}
      >
        {kind === "machines" ? (
          <FactoryIcon aria-hidden="true" className="size-3.5" />
        ) : kind === "power" ? (
          <ZapIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <BoxesIcon aria-hidden="true" className="size-3.5" />
        )}
        <span className={color}>{formatted}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="pointer-events-none">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

function AdditionalRecipeMetrics({
  comparison,
  assets,
  onSelect,
  disabled,
}: {
  comparison: RecipeComparison;
  assets: GameAssets;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const { fluidInputIds, byproducts, removedInputIds, addedInputIds } = comparison;
  const names = (ids: readonly string[]) =>
    ids.map((id) => assets.catalog.items[id]!.name).join(", ");
  function indicator(description: string, children: React.ReactNode) {
    return (
      <span className="inline-flex max-w-full items-center gap-2">
        <Tooltip disableHoverablePopup>
          <TooltipTrigger
            render={<button type="button" disabled={disabled} aria-label={description} />}
            aria-label={description}
            disabled={disabled}
            onClick={disabled ? undefined : onSelect}
            className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {children}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="pointer-events-none">
            {description}
          </TooltipContent>
        </Tooltip>
      </span>
    );
  }
  const icons = (ids: readonly string[]) =>
    ids.map((id) => (
      <CatalogIcon key={id} iconId={assets.catalog.items[id]!.iconId} assets={assets} size={16} />
    ));
  const changes = [
    removedInputIds.length ? `Removes ${names(removedInputIds)}` : "",
    addedInputIds.length ? `Adds ${names(addedInputIds)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <>
      {byproducts.length > 0 &&
        indicator(
          `Byproducts at equal output: ${byproducts
            .map(({ itemId, amountPerMinute }) => {
              const item = assets.catalog.items[itemId]!;
              return `${item.name} · ${number.format(amountPerMinute)}${item.unit === "m3" ? " m³/min" : "/min"}`;
            })
            .join(", ")}`,
          <>
            <GitBranchIcon aria-hidden="true" className="size-3.5" />
            <span>{byproducts.length}</span>
          </>,
        )}
      {fluidInputIds.length > 0 &&
        indicator(
          `Fluid inputs: ${names(fluidInputIds)}`,
          <>
            <DropletsIcon aria-hidden="true" className="size-3.5" />
            <span>{fluidInputIds.length}</span>
          </>,
        )}
      {changes &&
        indicator(
          `Material changes: ${changes}`,
          <>
            <ArrowLeftRightIcon aria-hidden="true" className="size-3.5" />
            {removedInputIds.length > 0 && addedInputIds.length === 0 && (
              <MinusIcon aria-hidden="true" className="size-3" />
            )}
            {icons(removedInputIds)}
            {removedInputIds.length > 0 && addedInputIds.length > 0 && (
              <ArrowRightIcon aria-hidden="true" className="size-3" />
            )}
            {removedInputIds.length === 0 && <PlusIcon aria-hidden="true" className="size-3" />}
            {icons(addedInputIds)}
          </>,
        )}
    </>
  );
}
