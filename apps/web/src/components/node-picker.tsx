import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

import {
  PRODUCTION_MACHINES,
  PRODUCTION_RECIPES,
  productionItem,
  productionMachine,
  recipesForMachine,
  recipesProducing,
  type MachineRecipeSelection,
  type ProductionMachine,
  type ProductionMaterial,
  type ProductionRecipe,
} from "@/game/production-catalog";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type NodePickerProps = {
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: MachineRecipeSelection) => void;
  open: boolean;
};

type PickerScope =
  | { type: "root" }
  | { machineId: string; type: "machine" }
  | { itemId: string; type: "routes" };

type PickerHistoryEntry = {
  query: string;
  scope: PickerScope;
  scrollTop: number;
};

const rateFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function filterProductionCatalog(
  value: string,
  query: string,
  keywords?: string[],
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return 1;

  const haystack = [value, ...(keywords ?? [])].join(" ").toLocaleLowerCase();
  if (haystack.includes(normalizedQuery)) return 2;

  return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term))
    ? 1
    : 0;
}

function recipeSearchScore(
  recipe: ProductionRecipe,
  machine: ProductionMachine | undefined,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return 1;

  const name = recipe.name.toLocaleLowerCase();
  if (name === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery)) return 90;
  if (name.includes(normalizedQuery)) return 80;

  const outputNames = recipe.outputs.map(
    ({ itemId }) => productionItem(itemId)?.name.toLocaleLowerCase() ?? "",
  );
  if (outputNames.some((outputName) => outputName.includes(normalizedQuery))) {
    return 60;
  }

  const inputNames = recipe.inputs.map(
    ({ itemId }) => productionItem(itemId)?.name.toLocaleLowerCase() ?? "",
  );
  if (inputNames.some((inputName) => inputName.includes(normalizedQuery))) {
    return 40;
  }

  const haystack = [
    recipe.name,
    recipe.id,
    recipe.alternate ? "alternate" : "standard",
    machine?.name ?? "",
    machine?.id ?? "",
    ...inputNames,
    ...outputNames,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term))
    ? 10
    : 0;
}

function formatMaterialRate(material: ProductionMaterial) {
  const item = productionItem(material.itemId);
  if (!item) return null;
  const unit = item.form === "solid" ? "/min" : " m³/min";
  return `${item.name} ${rateFormatter.format(material.ratePerMinute)}${unit}`;
}

function formatMaterials(materials: readonly ProductionMaterial[]) {
  return materials.map(formatMaterialRate).filter(Boolean).join(" + ");
}

function formatPower(recipe: ProductionRecipe, machine: ProductionMachine) {
  if (!recipe.power) return `${rateFormatter.format(machine.basePowerMw)} MW`;
  if (recipe.power.minimumMw === recipe.power.maximumMw) {
    return `${rateFormatter.format(recipe.power.minimumMw)} MW`;
  }
  return `${rateFormatter.format(recipe.power.minimumMw)}–${rateFormatter.format(recipe.power.maximumMw)} MW`;
}

function routeOutput(recipe: ProductionRecipe, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return (
    (normalizedQuery
      ? recipe.outputs.find(({ itemId }) =>
          productionItem(itemId)
            ?.name.toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : undefined) ?? recipe.outputs[0]
  );
}

type RecipeRowProps = {
  machine: ProductionMachine;
  onOpenRoutes?: (itemId: string) => void;
  onSelect: () => void;
  query: string;
  recipe: ProductionRecipe;
  showStandardBadge?: boolean;
};

function RecipeRow({
  machine,
  onOpenRoutes,
  onSelect,
  query,
  recipe,
  showStandardBadge = false,
}: RecipeRowProps) {
  const output = routeOutput(recipe, query);
  const routes = output ? recipesProducing(output.itemId) : [];
  const outputItem = output ? productionItem(output.itemId) : undefined;
  const inputSummary = formatMaterials(recipe.inputs);
  const outputSummary = formatMaterials(recipe.outputs);
  const itemKeywords = [...recipe.inputs, ...recipe.outputs]
    .map(({ itemId }) => productionItem(itemId)?.name)
    .filter((name): name is string => Boolean(name));
  const routeLabel = outputItem
    ? `Show ${routes.length} ways to produce ${outputItem.name}`
    : "Show production routes";

  return (
    <div className="flex items-stretch gap-px">
      <CommandItem
        className="min-w-0 flex-1 items-start rounded-r-none px-2.5 py-2"
        keywords={[
          machine.name,
          machine.id,
          recipe.id,
          recipe.alternate ? "alternate" : "standard",
          ...itemKeywords,
        ]}
        onSelect={onSelect}
        value={`recipe ${recipe.name} ${recipe.id}`}
      >
        <img
          alt=""
          aria-hidden="true"
          className="mt-0.5 size-10 shrink-0 object-contain"
          src={machine.imageUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{recipe.name}</span>
            {(recipe.alternate || showStandardBadge) && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.5625rem] leading-none text-muted-foreground">
                {recipe.alternate ? "Alternate" : "Standard"}
              </span>
            )}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[0.625rem] leading-relaxed text-muted-foreground">
            {inputSummary ? `${inputSummary} → ` : ""}
            {outputSummary}
          </div>
          <div
            className="mt-0.5 text-[0.625rem] text-muted-foreground"
            title="Power at 100% clock speed without production amplification"
          >
            {machine.name} · {formatPower(recipe, machine)} @100%
          </div>
        </div>
      </CommandItem>
      {onOpenRoutes && output && routes.length > 1 && (
        <button
          aria-label={routeLabel}
          className="flex min-w-16 shrink-0 items-center justify-center gap-0.5 rounded-r-md border-l border-border/60 px-2 text-[0.625rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => onOpenRoutes(output.itemId)}
          type="button"
        >
          {routes.length} ways
          <ChevronRight aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  );
}

export function NodePicker({ onOpenChange, onSelect, open }: NodePickerProps) {
  const [scope, setScope] = useState<PickerScope>({ type: "root" });
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<PickerHistoryEntry[]>([]);
  const restoreScrollTopRef = useRef<number | null>(null);

  const selectedMachine =
    scope.type === "machine" ? productionMachine(scope.machineId) : undefined;
  const routeItem =
    scope.type === "routes" ? productionItem(scope.itemId) : undefined;
  const visibleRecipes = selectedMachine
    ? recipesForMachine(selectedMachine.id)
    : routeItem
      ? recipesProducing(routeItem.id)
      : PRODUCTION_RECIPES;
  const matchingRecipes = visibleRecipes
    .map((recipe, index) => ({
      index,
      recipe,
      score: recipeSearchScore(
        recipe,
        selectedMachine ?? productionMachine(recipe.machineIds[0]),
        query,
      ),
    }))
    .filter(({ score }) => score > 0)
    .toSorted(
      (left, right) => right.score - left.score || left.index - right.index,
    )
    .map(({ recipe }) => recipe);
  const matchingMachines =
    scope.type === "root"
      ? PRODUCTION_MACHINES.filter(
          (machine) =>
            filterProductionCatalog(`machine ${machine.name}`, query, [
              machine.id,
            ]) > 0,
        )
      : [];
  const autoFocusSearch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 640px) and (pointer: fine)").matches;

  useEffect(() => {
    if (restoreScrollTopRef.current === null) return;
    const scrollTop = restoreScrollTopRef.current;
    restoreScrollTopRef.current = null;
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [scope]);

  const setOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      historyRef.current = [];
      restoreScrollTopRef.current = null;
      setQuery("");
      setScope({ type: "root" });
    }
    onOpenChange(nextOpen);
  };

  const selectRecipe = (recipe: ProductionRecipe, machineId: string) => {
    onSelect({ machineId, recipeId: recipe.id, recipeName: recipe.name });
    setOpen(false);
  };

  const enterScope = (nextScope: PickerScope) => {
    historyRef.current.push({
      query,
      scope,
      scrollTop: listRef.current?.scrollTop ?? 0,
    });
    setQuery("");
    setScope(nextScope);
  };

  const returnToPreviousResults = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    restoreScrollTopRef.current = previous.scrollTop;
    setQuery(previous.query);
    setScope(previous.scope);
  };

  const heading = selectedMachine
    ? selectedMachine.name
    : routeItem
      ? `Ways to produce ${routeItem.name}`
      : undefined;

  return (
    <CommandDialog
      className="top-2 bottom-2 h-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none translate-y-0 sm:top-1/2 sm:bottom-auto sm:h-auto sm:w-full sm:max-w-2xl sm:-translate-y-1/2"
      description="Search production machines and their recipes"
      initialFocus={autoFocusSearch ? undefined : false}
      onOpenChange={setOpen}
      open={open}
      title="Add node"
    >
      <Command className="min-h-0" shouldFilter={false}>
        {heading && (
          <div className="flex items-center gap-2 px-2 pt-2">
            <button
              aria-label="Back to previous recipe results"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={returnToPreviousResults}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
            </button>
            {selectedMachine && (
              <img
                alt=""
                aria-hidden="true"
                className="size-8 object-contain"
                src={selectedMachine.imageUrl}
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{heading}</div>
              <div className="text-[0.625rem] text-muted-foreground">
                Select a recipe
              </div>
            </div>
          </div>
        )}
        <CommandInput
          autoFocus={autoFocusSearch}
          enterKeyHint="search"
          onValueChange={setQuery}
          placeholder={
            selectedMachine
              ? `Search ${selectedMachine.name} recipes...`
              : routeItem
                ? `Search ways to produce ${routeItem.name}...`
                : "Search machines or recipes..."
          }
          value={query}
        />
        <CommandList
          className="min-h-0 flex-1 max-h-none overscroll-contain sm:max-h-[min(32rem,calc(100dvh-12rem))]"
          ref={listRef}
        >
          <CommandEmpty>No machines or recipes found.</CommandEmpty>
          {scope.type === "root" && matchingMachines.length > 0 && (
            <CommandGroup heading="Machines">
              {matchingMachines.map((machine) => {
                const recipeCount = recipesForMachine(machine.id).length;
                return (
                  <CommandItem
                    key={machine.id}
                    className="min-h-11"
                    keywords={[machine.id]}
                    onSelect={() =>
                      enterScope({ machineId: machine.id, type: "machine" })
                    }
                    value={`machine ${machine.name}`}
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className="size-9 object-contain"
                      src={machine.imageUrl}
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{machine.name}</div>
                      <div className="text-[0.625rem] text-muted-foreground">
                        {recipeCount} {recipeCount === 1 ? "recipe" : "recipes"}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          <CommandGroup
            heading={scope.type === "routes" ? "Production routes" : "Recipes"}
          >
            {matchingRecipes.map((recipe) => {
              const machine =
                selectedMachine ?? productionMachine(recipe.machineIds[0]);
              if (!machine) return null;
              return (
                <RecipeRow
                  key={`${machine.id}:${recipe.id}`}
                  machine={machine}
                  onOpenRoutes={
                    scope.type === "routes"
                      ? undefined
                      : (itemId) => enterScope({ itemId, type: "routes" })
                  }
                  onSelect={() => selectRecipe(recipe, machine.id)}
                  query={query}
                  recipe={recipe}
                  showStandardBadge={scope.type === "routes"}
                />
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
