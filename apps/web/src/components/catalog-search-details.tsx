/* oxlint-disable react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-function-as-prop -- The virtual window bounds icons; fallback state changes only after image errors. */
import type { Ingredient } from "@satisfactory-belt/game-data";
import { recipeSearchSummary, recipeAlternatives } from "@satisfactory-belt/game-data/search";
import type { SearchEntry } from "@satisfactory-belt/game-data/search";
import { ImageOffIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GameAssets } from "@/lib/game-assets";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

export function CatalogIcon({
  iconId,
  assets,
  large = false,
}: {
  iconId: string;
  assets: GameAssets;
  large?: boolean;
}) {
  const icon = assets.icons.icons[iconId];
  const sizes = large ? ([128, 256, 64] as const) : ([64, 128, 256] as const);
  const sources = icon
    ? sizes.map((size) => new URL(icon.variants[size].path, assets.baseUrl).href)
    : [];
  // Reset failed-image state when the requested asset changes (including hot reloads).
  return <CatalogImage key={sources.join("|")} sources={sources} size={large ? 64 : 32} />;
}

function CatalogImage({ sources, size }: { sources: readonly string[]; size: number }) {
  const [variant, setVariant] = useState(0);
  const src = sources[variant];
  const className =
    size === 64 ? "size-16 shrink-0 object-contain" : "size-8 shrink-0 object-contain";
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
}: {
  entry: SearchEntry;
  assets: GameAssets;
  machineId?: string;
  index: readonly SearchEntry[];
  onDetails: (entry: SearchEntry) => void;
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
      <section className="space-y-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <ul className="space-y-2">
          {entries.map((quantity) => {
            const item = catalog.items[quantity.itemId]!;
            return (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                <CatalogIcon iconId={item.iconId} assets={assets} />
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
  const description =
    producer?.description ?? sink?.description ?? part?.description ?? resource?.description;
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-4 pb-5">
        <div className="flex items-center gap-4">
          <CatalogIcon iconId={entry.iconId} assets={assets} large />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{entry.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {entry.kind === "recipe"
                ? recipeSearchSummary(catalog, entry.entityId, recipeMachineId)
                : entry.subtitle}
            </p>
          </div>
        </div>
        {/* Keep status badges out of the heading and reserve their row for every entry. */}
        <div className="mt-2 mb-5 flex h-5 items-center gap-2">
          {entry.alternate && <Badge variant="secondary">Alternate</Badge>}
          {entry.events.length > 0 && <Badge variant="outline">Event</Badge>}
        </div>
        {description && (
          <p className="mb-5 whitespace-pre-line text-sm text-muted-foreground">{description}</p>
        )}
        {recipe && (
          <div className="mb-6 grid gap-5 sm:grid-cols-2">
            {quantities("Inputs", recipe.ingredients, cycles)}
            {quantities("Outputs", recipe.products, cycles)}
          </div>
        )}
        {(recipe || entry.kind === "machine" || entry.kind === "extractor") && (
          <section className="mt-5 border-t pt-4">
            <h4 className="mb-2 text-sm font-medium">
              {recipe ? "Alternative recipes" : entry.kind === "machine" ? "Recipes" : "Resources"}
            </h4>
            {related.length ? (
              <ul className="space-y-1">
                {related.map((candidate) => (
                  <li key={candidate.id}>
                    <Button
                      variant="ghost"
                      className="h-auto min-h-12 w-full justify-start gap-3 px-2 py-2 text-left"
                      onClick={() => onDetails(candidate)}
                    >
                      <CatalogIcon assets={assets} iconId={candidate.iconId} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span>{candidate.name}</span>
                          {candidate.alternate && <Badge variant="secondary">Alternate</Badge>}
                        </span>
                        <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                          {candidate.subtitle}
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No alternative recipes.</p>
            )}
          </section>
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
    </ScrollArea>
  );
}
