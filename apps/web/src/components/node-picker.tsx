import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  defaultRangeExtractor,
  observeElementRect,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import { ArrowLeft, ArrowRight, SearchIcon } from "lucide-react";

import { CommandDialog } from "@/components/ui/command";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import {
  LOGISTICS_BUILDABLES,
  catalogBuildable,
  productionItem,
  productionMachine,
  productionRecipe,
  recipesProducing,
  resourceExtractor,
  resourcesForExtractor,
  type CatalogBuildable,
  type NodePickerSelection,
  type ProductionItem,
  type ProductionMachine,
  type ProductionMaterial,
  type ProductionRecipe,
  type ResourceExtractor,
} from "@/game/production-catalog";
import {
  recipeCountForMachine,
  searchExtractorResources,
  searchExtractors,
  searchLogistics,
  searchMachines,
  searchRecipes,
  searchSpecialBuildables,
} from "@/game/production-search";
import { cn } from "@/lib/utils";

type NodePickerProps = {
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: NodePickerSelection) => void;
  open: boolean;
};

type PickerScope =
  | { type: "root" }
  | { machineId: string; type: "machine" }
  | { extractorId: string; type: "extractor" }
  | { itemId: string; type: "routes" };

type PickerHistoryEntry = {
  query: string;
  scope: PickerScope;
  scrollTop: number;
};

type PickerRow =
  | { key: string; label: string; type: "heading" }
  | {
      buildable: CatalogBuildable;
      key: string;
      selection: NodePickerSelection;
      type: "recent";
    }
  | { key: string; machine: ProductionMachine; type: "machine" }
  | { extractor: ResourceExtractor; key: string; type: "extractor" }
  | {
      extractor: ResourceExtractor;
      key: string;
      resource: ProductionItem;
      type: "extractor-resource";
    }
  | { buildable: CatalogBuildable; key: string; type: "buildable" }
  | {
      key: string;
      machine: ProductionMachine;
      recipe: ProductionRecipe;
      type: "recipe";
    };

const rateFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const RECENT_SELECTIONS_KEY = "satisfactory-belt-recent-node-selections";
const RECENT_SELECTION_LIMIT = 5;

function isNodePickerSelection(value: unknown): value is NodePickerSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Record<string, unknown>;
  return (
    typeof selection.label === "string" &&
    typeof selection.machineId === "string" &&
    (selection.recipeId === undefined || typeof selection.recipeId === "string")
  );
}

function readRecentSelections() {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RECENT_SELECTIONS_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isNodePickerSelection)
      .slice(0, RECENT_SELECTION_LIMIT);
  } catch {
    return [];
  }
}

function selectionKey(selection: NodePickerSelection) {
  return `${selection.machineId}:${selection.recipeId ?? ""}:${selection.label}`;
}

function withRecentSelection(
  selections: readonly NodePickerSelection[],
  selection: NodePickerSelection,
) {
  const key = selectionKey(selection);
  return [
    selection,
    ...selections.filter((recent) => selectionKey(recent) !== key),
  ].slice(0, RECENT_SELECTION_LIMIT);
}

function normalizedSearchTerms(query: string) {
  return [
    ...new Set(query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)),
  ];
}

function includesSearchTerms(value: string, terms: readonly string[]) {
  const normalizedValue = value.toLocaleLowerCase();
  return terms.every((term) => normalizedValue.includes(term));
}

function missingSearchTerms(value: string, query: string) {
  const normalizedValue = value.toLocaleLowerCase();
  return normalizedSearchTerms(query).filter(
    (term) => !normalizedValue.includes(term),
  );
}

function highlightSearchTerms(query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  return [...new Set([normalizedQuery, ...normalizedSearchTerms(query)])]
    .filter(Boolean)
    .toSorted((left, right) => right.length - left.length);
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  const terms = highlightSearchTerms(query);
  if (terms.length === 0) return text;

  const expression = new RegExp(
    `(${terms.map(escapeRegularExpression).join("|")})`,
    "gi",
  );
  return (
    <>
      {text.split(expression).map((part, index) =>
        terms.includes(part.toLocaleLowerCase()) ? (
          <mark
            className="rounded-[0.2rem] bg-amber-300/60 px-0.5 text-foreground dark:bg-amber-400/30"
            key={`${part}:${index}`}
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function MatchReason({ query, reason }: { query: string; reason?: string }) {
  if (!reason) return null;
  return (
    <div
      className="truncate text-[0.625rem] text-muted-foreground"
      title={reason}
    >
      <HighlightedText query={query} text={reason} />
    </div>
  );
}

function buildableMatchReason(
  buildable: CatalogBuildable,
  query: string,
  categoryLabel: string,
  categoryKeywords: readonly string[],
) {
  const missingTerms = missingSearchTerms(buildable.name, query);
  if (missingTerms.length === 0) return undefined;

  const matchingSearchTerm = buildable.searchTerms?.find((term) =>
    includesSearchTerms(term, missingTerms),
  );
  if (matchingSearchTerm) return `Matches: ${matchingSearchTerm}`;

  if (
    [categoryLabel, ...categoryKeywords].some((value) =>
      includesSearchTerms(value, missingTerms),
    )
  ) {
    return `Matches category: ${categoryLabel}`;
  }
  if (includesSearchTerms(buildable.id, missingTerms)) {
    return `Matches building ID: ${buildable.id}`;
  }
  return undefined;
}

function extractorMatchReason(extractor: ResourceExtractor, query: string) {
  const missingTerms = missingSearchTerms(extractor.name, query);
  if (missingTerms.length === 0) return undefined;

  const matchingResource = resourcesForExtractor(extractor.id).find(
    (resource) => includesSearchTerms(resource.name, missingTerms),
  );
  if (matchingResource) return `Matches resource: ${matchingResource.name}`;

  const matchingSearchTerm = extractor.searchTerms?.find((term) =>
    includesSearchTerms(term, missingTerms),
  );
  if (matchingSearchTerm) return `Matches resource: ${matchingSearchTerm}`;

  return buildableMatchReason(extractor, query, "Resource extraction", [
    "resource",
    "extraction",
    "extractor",
    "miner",
  ]);
}

function standaloneBuildableMatchReason(
  buildable: CatalogBuildable,
  query: string,
) {
  if (LOGISTICS_BUILDABLES.some(({ id }) => id === buildable.id)) {
    return buildableMatchReason(buildable, query, "Logistics", [
      "logistics",
      "conveyor",
      "pipeline",
    ]);
  }
  return buildableMatchReason(buildable, query, "Special", ["special", "sink"]);
}

function recipeMatchReason(
  recipe: ProductionRecipe,
  machine: ProductionMachine,
  query: string,
) {
  const terms = normalizedSearchTerms(query);
  if (terms.length === 0) return undefined;

  const visibleValues = [
    recipe.name,
    recipe.alternate ? "Alternate" : "Standard",
    machine.name,
    ...formatMaterials(recipe.inputs).map(({ name }) => name),
    ...formatMaterials(recipe.outputs).map(({ name }) => name),
  ];
  if (
    terms.every((term) =>
      visibleValues.some((value) => value.toLocaleLowerCase().includes(term)),
    )
  ) {
    return undefined;
  }
  if (includesSearchTerms(recipe.id, terms)) {
    return `Matches recipe ID: ${recipe.id}`;
  }
  if (includesSearchTerms(machine.id, terms)) {
    return `Matches machine ID: ${machine.id}`;
  }
  return undefined;
}

function formatMaterial(material: ProductionMaterial) {
  const item = productionItem(material.itemId);
  if (!item) return null;
  const unit = item.form === "solid" ? "/min" : " m³/min";
  return {
    name: item.name,
    rate: `${rateFormatter.format(material.ratePerMinute)}${unit}`,
  };
}

function formatMaterials(materials: readonly ProductionMaterial[]) {
  return materials
    .map(formatMaterial)
    .filter((material): material is NonNullable<typeof material> =>
      Boolean(material),
    );
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

function optionDomId(listId: string, rowKey: string) {
  return `${listId}-${rowKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function isSelectableRow(row: PickerRow) {
  return row.type !== "heading";
}

function estimatedRowHeight(row: PickerRow) {
  if (row.type === "heading") return 30;
  if (row.type !== "recipe") return 68;
  return 58 + (row.recipe.inputs.length + row.recipe.outputs.length) * 18;
}

type RecipeRowProps = {
  active: boolean;
  domId: string;
  machine: ProductionMachine;
  onActivate: () => void;
  onOpenRoutes?: (itemId: string) => void;
  onSelect: () => void;
  position: number;
  query: string;
  recipe: ProductionRecipe;
  setSize: number;
  showStandardBadge?: boolean;
};

function RecipeRow({
  active,
  domId,
  machine,
  onActivate,
  onOpenRoutes,
  onSelect,
  position,
  query,
  recipe,
  setSize,
  showStandardBadge = false,
}: RecipeRowProps) {
  const output = routeOutput(recipe, query);
  const routes = output ? recipesProducing(output.itemId) : [];
  const outputItem = output ? productionItem(output.itemId) : undefined;
  const inputMaterials = formatMaterials(recipe.inputs);
  const outputMaterials = formatMaterials(recipe.outputs);
  const materialSearchTerms = normalizedSearchTerms(query);
  const hasMaterialMatch = [...inputMaterials, ...outputMaterials].some(
    ({ name }) => includesSearchTerms(name, materialSearchTerms),
  );
  const materialClassName = (name: string) =>
    cn(
      "transition-opacity",
      hasMaterialMatch &&
        !includesSearchTerms(name, materialSearchTerms) &&
        "opacity-45",
    );
  const matchReason = recipeMatchReason(recipe, machine, query);
  const routeLabel = outputItem
    ? `Show ${outputItem.name} recipes`
    : "Show recipes";

  return (
    <div
      className="flex items-stretch rounded-md data-[active=true]:bg-muted"
      data-active={active}
      onMouseEnter={onActivate}
    >
      <div
        aria-posinset={position}
        aria-selected={active}
        aria-setsize={setSize}
        className="flex min-w-0 flex-1 cursor-default items-start gap-3 rounded-md px-2.5 py-2 text-xs/relaxed outline-hidden"
        id={domId}
        onClick={onSelect}
        role="option"
      >
        <img
          alt=""
          aria-hidden="true"
          className="mt-0.5 size-14 shrink-0 object-contain"
          decoding="async"
          loading="lazy"
          src={machine.imageUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">
              <HighlightedText query={query} text={recipe.name} />
            </span>
            {(recipe.alternate || showStandardBadge) && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.5625rem] leading-none text-muted-foreground">
                <HighlightedText
                  query={query}
                  text={recipe.alternate ? "Alternate" : "Standard"}
                />
              </span>
            )}
          </div>
          <div className="mt-0.5 grid grid-cols-[1.5rem_max-content_minmax(0,1fr)] items-baseline gap-x-1 text-[0.625rem] leading-relaxed text-muted-foreground">
            {inputMaterials.map((material, index) => (
              <div className="contents" key={`input:${material.name}:${index}`}>
                <span
                  aria-label={index === 0 ? "Inputs" : undefined}
                  className="font-medium tracking-wide text-muted-foreground/70"
                >
                  {index === 0 ? "IN" : ""}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    materialClassName(material.name),
                  )}
                >
                  {material.rate}
                </span>
                <span
                  className={cn("truncate", materialClassName(material.name))}
                  title={material.name}
                >
                  <HighlightedText query={query} text={material.name} />
                </span>
              </div>
            ))}
            {outputMaterials.map((material, index) => (
              <div
                className="contents"
                key={`output:${material.name}:${index}`}
              >
                <span
                  aria-label={index === 0 ? "Outputs" : undefined}
                  className="font-medium tracking-wide text-muted-foreground/70"
                >
                  {index === 0 ? "OUT" : ""}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    materialClassName(material.name),
                  )}
                >
                  {material.rate}
                </span>
                <span
                  className={cn("truncate", materialClassName(material.name))}
                  title={material.name}
                >
                  <HighlightedText query={query} text={material.name} />
                </span>
              </div>
            ))}
          </div>
          {matchReason && (
            <div className="mt-0.5">
              <MatchReason query={query} reason={matchReason} />
            </div>
          )}
          <div
            className="mt-0.5 text-[0.625rem] text-muted-foreground"
            title="Power at 100% clock speed without production amplification"
          >
            <HighlightedText query={query} text={machine.name} /> ·{" "}
            {formatPower(recipe, machine)}
          </div>
        </div>
      </div>
      {onOpenRoutes && output && routes.length > 1 ? (
        <button
          aria-label={routeLabel}
          className="flex size-11 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => onOpenRoutes(output.itemId)}
          title={routeLabel}
          type="button"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}
    </div>
  );
}

export function NodePicker({ onOpenChange, onSelect, open }: NodePickerProps) {
  const [scope, setScope] = useState<PickerScope>({ type: "root" });
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [recentSelections, setRecentSelections] =
    useState(readRecentSelections);
  const listRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<PickerHistoryEntry[]>([]);
  const restoreScrollTopRef = useRef<number | null>(null);
  const listId = useId();

  const selectedMachine =
    scope.type === "machine" ? productionMachine(scope.machineId) : undefined;
  const selectedExtractor =
    scope.type === "extractor"
      ? resourceExtractor(scope.extractorId)
      : undefined;
  const routeItem =
    scope.type === "routes" ? productionItem(scope.itemId) : undefined;
  const rootScope = scope.type === "root";
  const rootQueryActive = rootScope && query.trim().length > 0;
  const matchingRecipes = useMemo(() => {
    if (
      !open ||
      scope.type === "extractor" ||
      (rootScope && !rootQueryActive)
    ) {
      return [];
    }
    return searchRecipes(query, {
      machineId: selectedMachine?.id,
      outputItemId: routeItem?.id,
    });
  }, [
    open,
    query,
    rootQueryActive,
    rootScope,
    routeItem?.id,
    scope.type,
    selectedMachine?.id,
  ]);
  const matchingMachines = useMemo(
    () => (open && rootScope ? searchMachines(query) : []),
    [open, query, rootScope],
  );
  const matchingExtractors = useMemo(
    () => (open && rootScope ? searchExtractors(query) : []),
    [open, query, rootScope],
  );
  const matchingLogistics = useMemo(
    () => (open && rootScope ? searchLogistics(query) : []),
    [open, query, rootScope],
  );
  const matchingSpecial = useMemo(
    () => (open && rootScope ? searchSpecialBuildables(query) : []),
    [open, query, rootScope],
  );
  const matchingExtractorResources = useMemo(
    () =>
      open && selectedExtractor
        ? searchExtractorResources(selectedExtractor.id, query)
        : [],
    [open, query, selectedExtractor],
  );
  const recentRows = useMemo(
    () =>
      rootScope && !rootQueryActive
        ? recentSelections.flatMap((selection) => {
            const buildable = catalogBuildable(selection.machineId);
            if (
              !buildable ||
              (selection.recipeId && !productionRecipe(selection.recipeId))
            ) {
              return [];
            }
            return [
              {
                buildable,
                key: `recent:${selectionKey(selection)}`,
                selection,
                type: "recent" as const,
              },
            ];
          })
        : [],
    [recentSelections, rootQueryActive, rootScope],
  );

  const rows = useMemo(() => {
    const nextRows: PickerRow[] = [];
    const addHeading = (key: string, label: string) =>
      nextRows.push({ key: `heading:${key}`, label, type: "heading" });

    if (recentRows.length > 0) {
      addHeading("recent", "Recently used");
      nextRows.push(...recentRows);
    }

    if (matchingMachines.length > 0) {
      addHeading("machines", "Machines");
      matchingMachines.forEach((machine) =>
        nextRows.push({
          key: `machine:${machine.id}`,
          machine,
          type: "machine",
        }),
      );
    }

    if (matchingExtractors.length > 0) {
      addHeading("extractors", "Resource extraction");
      matchingExtractors.forEach((extractor) =>
        nextRows.push({
          extractor,
          key: `extractor:${extractor.id}`,
          type: "extractor",
        }),
      );
    }

    const addBuildables = (
      key: string,
      label: string,
      buildables: readonly CatalogBuildable[],
    ) => {
      if (buildables.length === 0) return;
      addHeading(key, label);
      buildables.forEach((buildable) =>
        nextRows.push({
          buildable,
          key: `buildable:${buildable.id}`,
          type: "buildable",
        }),
      );
    };

    addBuildables("logistics", "Logistics", matchingLogistics);
    addBuildables("special", "Special", matchingSpecial);

    if (selectedExtractor && matchingExtractorResources.length > 0) {
      addHeading("extractor-recipes", "Recipes");
      matchingExtractorResources.forEach((resource) =>
        nextRows.push({
          extractor: selectedExtractor,
          key: `extractor-resource:${selectedExtractor.id}:${resource.id}`,
          resource,
          type: "extractor-resource",
        }),
      );
    }

    if (matchingRecipes.length > 0) {
      addHeading("recipes", "Recipes");
      matchingRecipes.forEach((recipe) => {
        const machine =
          selectedMachine ?? productionMachine(recipe.machineIds[0]);
        if (!machine) return;
        nextRows.push({
          key: `recipe:${machine.id}:${recipe.id}`,
          machine,
          recipe,
          type: "recipe",
        });
      });
    }

    return nextRows;
  }, [
    matchingExtractors,
    matchingLogistics,
    matchingMachines,
    matchingRecipes,
    matchingSpecial,
    matchingExtractorResources,
    recentRows,
    selectedExtractor,
    selectedMachine,
  ]);

  const selectableIndices = useMemo(
    () => rows.flatMap((row, index) => (isSelectableRow(row) ? [index] : [])),
    [rows],
  );
  const selectablePositionByIndex = useMemo(
    () =>
      new Map(
        selectableIndices.map((rowIndex, index) => [rowIndex, index + 1]),
      ),
    [selectableIndices],
  );
  const selectedIndex = rows.findIndex((row) => row.key === activeKey);
  const activeIndex =
    selectedIndex >= 0 ? selectedIndex : (selectableIndices[0] ?? -1);
  const activeRow = rows[activeIndex];

  const rangeExtractor = (range: Range) => {
    const indices = defaultRangeExtractor(range);
    if (activeIndex < 0 || indices.includes(activeIndex)) return indices;
    return [...indices, activeIndex].toSorted((left, right) => left - right);
  };
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    enabled: open,
    estimateSize: (index) => estimatedRowHeight(rows[index]),
    gap: 4,
    getItemKey: (index) => rows[index]?.key ?? index,
    getScrollElement: () => listRef.current,
    initialRect: { height: 512, width: 672 },
    measureElement: (element) => {
      const index = Number(element.getAttribute("data-index"));
      return (
        element.getBoundingClientRect().height ||
        (rows[index] ? estimatedRowHeight(rows[index]) : 0)
      );
    },
    observeElementRect: (instance, callback) =>
      observeElementRect(instance, (rect) =>
        callback({
          height: rect.height || 512,
          width: rect.width || 672,
        }),
      ),
    overscan: 5,
    rangeExtractor,
    useFlushSync: false,
  });

  const autoFocusSearch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 640px) and (pointer: fine)").matches;

  useEffect(() => {
    if (activeIndex < 0) {
      setActiveKey(null);
      return;
    }
    if (selectedIndex < 0) setActiveKey(rows[activeIndex].key);
  }, [activeIndex, rows, selectedIndex]);

  useEffect(() => {
    if (restoreScrollTopRef.current === null) return;
    const scrollTop = restoreScrollTopRef.current;
    restoreScrollTopRef.current = null;
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [query, scope]);

  const setOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      historyRef.current = [];
      restoreScrollTopRef.current = null;
      setActiveKey(null);
      setQuery("");
      setScope({ type: "root" });
    }
    onOpenChange(nextOpen);
  };

  const submitSelection = (selection: NodePickerSelection) => {
    setRecentSelections((current) => {
      const next = withRecentSelection(current, selection);
      try {
        localStorage.setItem(RECENT_SELECTIONS_KEY, JSON.stringify(next));
      } catch {
        // The selection should still work when browser storage is unavailable.
      }
      return next;
    });
    onSelect(selection);
    setOpen(false);
  };

  const selectRecipe = (recipe: ProductionRecipe, machineId: string) => {
    submitSelection({
      label: recipe.name,
      machineId,
      recipeId: recipe.id,
    });
  };

  const selectBuildable = (buildable: CatalogBuildable) => {
    submitSelection({ label: buildable.name, machineId: buildable.id });
  };

  const selectExtractorResource = (
    extractor: ResourceExtractor,
    resource: ProductionItem,
  ) => {
    submitSelection({ label: resource.name, machineId: extractor.id });
  };

  const enterScope = (nextScope: PickerScope) => {
    historyRef.current.push({
      query,
      scope,
      scrollTop: listRef.current?.scrollTop ?? 0,
    });
    restoreScrollTopRef.current = 0;
    setActiveKey(null);
    setQuery("");
    setScope(nextScope);
  };

  const returnToPreviousResults = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    restoreScrollTopRef.current = previous.scrollTop;
    setActiveKey(null);
    setQuery(previous.query);
    setScope(previous.scope);
  };

  const selectRow = (row: PickerRow) => {
    if (row.type === "recent") {
      submitSelection(row.selection);
    } else if (row.type === "machine") {
      enterScope({ machineId: row.machine.id, type: "machine" });
    } else if (row.type === "extractor") {
      const resources = resourcesForExtractor(row.extractor.id);
      if (resources.length > 1) {
        enterScope({ extractorId: row.extractor.id, type: "extractor" });
      } else if (resources[0]) {
        selectExtractorResource(row.extractor, resources[0]);
      } else {
        selectBuildable(row.extractor);
      }
    } else if (row.type === "extractor-resource") {
      selectExtractorResource(row.extractor, row.resource);
    } else if (row.type === "buildable") {
      selectBuildable(row.buildable);
    } else if (row.type === "recipe") {
      selectRecipe(row.recipe, row.machine.id);
    }
  };

  const activateIndex = (index: number) => {
    const row = rows[index];
    if (!row || !isSelectableRow(row)) return;
    setActiveKey(row.key);
    rowVirtualizer.scrollToIndex(index, { align: "auto" });
  };

  const moveActive = (direction: -1 | 1) => {
    if (selectableIndices.length === 0) return;
    const position = selectableIndices.indexOf(activeIndex);
    const nextPosition =
      position < 0
        ? 0
        : Math.min(
            selectableIndices.length - 1,
            Math.max(0, position + direction),
          );
    activateIndex(selectableIndices[nextPosition]);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (
      event.key === "Enter" &&
      activeRow &&
      isSelectableRow(activeRow)
    ) {
      event.preventDefault();
      selectRow(activeRow);
    }
  };

  const heading = selectedMachine
    ? selectedMachine.name
    : selectedExtractor
      ? selectedExtractor.name
      : routeItem
        ? `${routeItem.name} Recipes`
        : undefined;
  const headingImage =
    selectedMachine?.imageUrl ??
    selectedExtractor?.imageUrl ??
    routeItem?.imageUrl;

  return (
    <CommandDialog
      className="top-2 bottom-2 h-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none translate-y-0 sm:top-1/2 sm:bottom-auto sm:h-auto sm:w-full sm:max-w-2xl sm:-translate-y-1/2"
      description="Search production buildings and recipes"
      initialFocus={autoFocusSearch ? undefined : false}
      onOpenChange={setOpen}
      open={open}
      title="Add node"
    >
      <div className="flex size-full min-h-0 flex-col gap-3 overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground">
        {heading && (
          <div className="flex min-h-14 items-center gap-3 px-2 pt-2">
            <button
              aria-label="Back to previous recipe results"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onClick={returnToPreviousResults}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
            </button>
            {headingImage && (
              <img
                alt=""
                aria-hidden="true"
                className="size-14 object-contain"
                decoding="async"
                src={headingImage}
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-medium">{heading}</div>
              <div className="text-xs text-muted-foreground">
                Select a recipe
              </div>
            </div>
          </div>
        )}
        <div className="p-1 pb-0">
          <InputGroup className="h-8! bg-input/20 dark:bg-input/30">
            <input
              aria-activedescendant={
                activeRow ? optionDomId(listId, activeRow.key) : undefined
              }
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              autoFocus={autoFocusSearch}
              className="w-full text-xs/relaxed outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
              enterKeyHint="search"
              onChange={(event) => {
                restoreScrollTopRef.current = 0;
                setActiveKey(null);
                setQuery(event.target.value);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={
                selectedMachine
                  ? `Search ${selectedMachine.name} recipes...`
                  : selectedExtractor
                    ? `Search ${selectedExtractor.name} recipes...`
                    : routeItem
                      ? `Search ${routeItem.name} recipes...`
                      : "Search buildings or recipes..."
              }
              role="combobox"
              value={query}
            />
            <InputGroupAddon>
              <SearchIcon className="size-3.5 shrink-0 opacity-50" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div
          aria-label="Buildings and recipes"
          className="no-scrollbar min-h-[clamp(10rem,45dvh,20rem)] flex-1 max-h-none overscroll-contain overflow-x-hidden overflow-y-auto outline-none sm:min-h-[min(32rem,calc(100dvh-12rem))] sm:max-h-[min(32rem,calc(100dvh-12rem))]"
          id={listId}
          ref={listRef}
          role="listbox"
        >
          {rows.length === 0 ? (
            <div className="py-6 text-center text-xs/relaxed">
              No buildings or recipes found.
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const active = virtualRow.index === activeIndex;
                const domId = optionDomId(listId, row.key);
                const position =
                  selectablePositionByIndex.get(virtualRow.index) ?? 0;
                return (
                  <div
                    className="absolute top-0 left-0 w-full px-1"
                    data-index={virtualRow.index}
                    key={row.key}
                    ref={rowVirtualizer.measureElement}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.type === "heading" ? (
                      <div
                        aria-label={row.label}
                        className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
                        role="separator"
                      >
                        <HighlightedText query={query} text={row.label} />
                      </div>
                    ) : row.type === "recent" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableIndices.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectRow(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={row.buildable.imageUrl}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {row.selection.label}
                          </div>
                          {row.selection.label !== row.buildable.name && (
                            <div className="truncate text-[0.625rem] text-muted-foreground">
                              {row.buildable.name}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : row.type === "machine" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableIndices.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectRow(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={row.machine.imageUrl}
                        />
                        <div className="min-w-0">
                          <div className="font-medium">
                            <HighlightedText
                              query={query}
                              text={row.machine.name}
                            />
                          </div>
                          <div className="text-[0.625rem] text-muted-foreground">
                            {recipeCountForMachine(row.machine.id)}{" "}
                            {recipeCountForMachine(row.machine.id) === 1
                              ? "recipe"
                              : "recipes"}
                          </div>
                          <MatchReason
                            query={query}
                            reason={buildableMatchReason(
                              row.machine,
                              query,
                              "Machines",
                              ["machine"],
                            )}
                          />
                        </div>
                      </div>
                    ) : row.type === "extractor" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableIndices.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectRow(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={row.extractor.imageUrl}
                        />
                        <div className="min-w-0">
                          <div className="font-medium">
                            <HighlightedText
                              query={query}
                              text={row.extractor.name}
                            />
                          </div>
                          <div className="text-[0.625rem] text-muted-foreground">
                            {row.extractor.resourceItemIds.length}{" "}
                            {row.extractor.resourceItemIds.length === 1
                              ? "recipe"
                              : "recipes"}
                          </div>
                          <MatchReason
                            query={query}
                            reason={extractorMatchReason(row.extractor, query)}
                          />
                        </div>
                      </div>
                    ) : row.type === "extractor-resource" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableIndices.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectRow(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={row.extractor.imageUrl}
                        />
                        <div className="font-medium">
                          <HighlightedText
                            query={query}
                            text={row.resource.name}
                          />
                        </div>
                      </div>
                    ) : row.type === "buildable" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableIndices.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectRow(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={row.buildable.imageUrl}
                        />
                        <div className="min-w-0">
                          <div className="font-medium">
                            <HighlightedText
                              query={query}
                              text={row.buildable.name}
                            />
                          </div>
                          <MatchReason
                            query={query}
                            reason={standaloneBuildableMatchReason(
                              row.buildable,
                              query,
                            )}
                          />
                        </div>
                      </div>
                    ) : (
                      <RecipeRow
                        active={active}
                        domId={domId}
                        machine={row.machine}
                        onActivate={() => setActiveKey(row.key)}
                        onOpenRoutes={
                          scope.type === "routes"
                            ? undefined
                            : (itemId) => enterScope({ itemId, type: "routes" })
                        }
                        onSelect={() => selectRow(row)}
                        position={position}
                        query={query}
                        recipe={row.recipe}
                        setSize={selectableIndices.length}
                        showStandardBadge={scope.type === "routes"}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </CommandDialog>
  );
}
