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
import {
  createNode,
  findBuffer,
  findBuildable,
  findDescriptor,
  findPowerGenerator,
  findProductionMachine,
  findResourceExtractor,
  findResourceWellPressurizer,
  findRouter,
  findTransport,
  productionProcessesForBuildable,
  recipeCountForMachine,
  recipesProducing,
  searchBuffers,
  searchExtractors,
  searchLogistics,
  searchMachines,
  searchPowerGenerators,
  searchRecipes,
  searchResourceWellPressurizers,
  searchSpecialBuildables,
  searchTransports,
  type Buildable,
  type Descriptor,
  type ProductionMachine,
  type ProductionMaterial,
  type Recipe,
  type ResourceExtractor,
  type ResourceWellPressurizer,
  type NodeRequest,
  type NodeTemplate,
} from "@satisfactory-belt/production";
import { ArrowLeft, ArrowRight, SearchIcon } from "lucide-react";

import { CommandDialog } from "@/components/ui/command";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { buildableImageUrl, descriptorImageUrl } from "@/game/catalog-images";
import { cn } from "@/lib/utils";

export type NodePickerSelection = Readonly<{
  label: string;
  node: NodeTemplate;
}>;

type NodePickerProps = {
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: NodePickerSelection) => void;
  open: boolean;
};

type PickerScope =
  | { type: "root" }
  | { machineId: string; type: "machine" }
  | { extractorId: string; type: "extractor" }
  | { buildableId: string; type: "configuration" }
  | { itemId: string; type: "routes" };

type PickerHistoryEntry = {
  query: string;
  scope: PickerScope;
  scrollTop: number;
};

type ResourceSource = ResourceExtractor | ResourceWellPressurizer;

type RecentPickerOption = {
  buildable: Buildable;
  key: string;
  selection: NodePickerSelection;
  type: "recent";
};

type BuildablePickerOption = {
  buildable: Buildable;
  key: string;
  type: "buildable";
};

type ConfigurableBuildablePickerOption = {
  buildable: Buildable;
  key: string;
  type: "configurable-buildable";
};

type ConfigurationPickerOption = {
  buildable: Buildable;
  key: string;
  selection: NodePickerSelection;
  type: "configuration";
};

type PickerOption =
  | RecentPickerOption
  | { key: string; machine: ProductionMachine; type: "machine" }
  | { extractor: ResourceSource; key: string; type: "extractor" }
  | {
      extractor: ResourceSource;
      key: string;
      resource: Descriptor;
      type: "extractor-resource";
    }
  | BuildablePickerOption
  | ConfigurableBuildablePickerOption
  | ConfigurationPickerOption
  | {
      key: string;
      machine: ProductionMachine;
      recipe: Recipe;
      type: "recipe";
    };

type PickerListOption = Exclude<PickerOption, RecentPickerOption>;

type PickerRow =
  | { key: string; label: string; type: "heading" }
  | {
      key: string;
      layout: "logistics" | "recent";
      options: readonly (BuildablePickerOption | RecentPickerOption)[];
      type: "grid";
    }
  | PickerListOption;

const rateFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const RECENT_SELECTIONS_KEY = "satisfactory-belt-recent-node-selections";
const RECENT_SELECTION_LIMIT = 5;
const LOGISTICS_QUICK_ADD_ORDER = new Map(
  [
    "Build_ConveyorAttachmentSplitter_C",
    "Build_ConveyorAttachmentMerger_C",
    "Build_PipelineJunction_Cross_C",
    "Build_ConveyorAttachmentSplitterSmart_C",
    "Build_ConveyorAttachmentMergerPriority_C",
    "Build_ConveyorAttachmentSplitterProgrammable_C",
    "Build_PipelineJunction_T_C",
  ].map((id, index) => [id, index]),
);

function isNodePickerSelection(value: unknown): value is NodePickerSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Record<string, unknown>;
  if (typeof selection.label !== "string" || !selection.node) return false;
  try {
    createNode({
      ...(selection.node as NodeTemplate),
      id: "recent-selection-validation",
    } as NodeRequest);
    return true;
  } catch {
    return false;
  }
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
  return `${JSON.stringify(selection.node)}:${selection.label}`;
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
  buildable: Buildable,
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

function resourcesForSource(source: ResourceSource) {
  return source.resourceItemIds.flatMap((itemId) => {
    const descriptor = findDescriptor(itemId);
    return descriptor ? [descriptor] : [];
  });
}

function extractorMatchReason(extractor: ResourceSource, query: string) {
  const missingTerms = missingSearchTerms(extractor.name, query);
  if (missingTerms.length === 0) return undefined;

  const matchingResource = resourcesForSource(extractor).find((resource) =>
    includesSearchTerms(resource.name, missingTerms),
  );
  if (matchingResource) return `Matches resource: ${matchingResource.name}`;

  const matchingSearchTerm = extractor.searchTerms?.find((term) =>
    includesSearchTerms(term, missingTerms),
  );
  if (matchingSearchTerm) return `Matches resource: ${matchingSearchTerm}`;

  return buildableMatchReason(extractor, query, "Production", [
    "production",
    "resource",
    "extraction",
    "extractor",
    "miner",
  ]);
}

function standaloneBuildableMatchReason(buildable: Buildable, query: string) {
  const categories: Readonly<
    Record<Buildable["category"], readonly [string, readonly string[]]>
  > = {
    architecture: ["Architecture", ["architecture"]],
    logistics: ["Logistics", ["logistics", "conveyor", "pipeline"]],
    organization: ["Organization", ["organization", "storage", "buffer"]],
    power: ["Power", ["power", "generation", "generator"]],
    production: ["Production", ["production"]],
    special: ["Special", ["special", "sink"]],
    transport: ["Transport", ["transport", "station", "platform", "port"]],
  };
  const [label, keywords] = categories[buildable.category];
  return buildableMatchReason(buildable, query, label, keywords);
}

function configurationsForBuildable(
  buildable: Buildable,
): readonly NodePickerSelection[] {
  const generator = findPowerGenerator(buildable.id);
  if (generator) {
    return productionProcessesForBuildable(generator.id).map((process) => ({
      label: process.name,
      node: {
        buildableId: generator.id,
        kind: "process" as const,
        processId: process.id,
      },
    }));
  }

  const transport = findTransport(buildable.id);
  if (!transport) return [];
  return (["load", "unload"] as const).map((mode) => ({
    label: `${transport.name} (${mode === "load" ? "Load" : "Unload"})`,
    node: { buildableId: transport.id, kind: "transport", mode },
  }));
}

function recipeMatchReason(
  recipe: Recipe,
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
  const item = findDescriptor(material.itemId);
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

function formatPower(recipe: Recipe, machine: ProductionMachine) {
  if (!recipe.power) return `${rateFormatter.format(machine.basePowerMw)} MW`;
  if (recipe.power.minimumMw === recipe.power.maximumMw) {
    return `${rateFormatter.format(recipe.power.minimumMw)} MW`;
  }
  return `${rateFormatter.format(recipe.power.minimumMw)}–${rateFormatter.format(recipe.power.maximumMw)} MW`;
}

function routeOutput(recipe: Recipe, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return (
    (normalizedQuery
      ? recipe.outputs.find(({ itemId }) =>
          findDescriptor(itemId)
            ?.name.toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : undefined) ?? recipe.outputs[0]
  );
}

function optionDomId(listId: string, rowKey: string) {
  return `${listId}-${rowKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function optionsForRow(row: PickerRow): readonly PickerOption[] {
  if (row.type === "heading") return [];
  return row.type === "grid" ? row.options : [row];
}

function estimatedRowHeight(row: PickerRow) {
  if (row.type === "heading") return 30;
  if (row.type === "grid") return row.layout === "recent" ? 100 : 200;
  if (row.type !== "recipe") return 68;
  return 58 + (row.recipe.inputs.length + row.recipe.outputs.length) * 18;
}

type PickerTileProps = {
  active: boolean;
  domId: string;
  imageUrl: string;
  label: string;
  onActivate: () => void;
  onSelect: () => void;
  position: number;
  setSize: number;
  subtitle?: string;
};

function PickerTile({
  active,
  domId,
  imageUrl,
  label,
  onActivate,
  onSelect,
  position,
  setSize,
  subtitle,
}: PickerTileProps) {
  return (
    <div
      aria-posinset={position}
      aria-selected={active}
      aria-setsize={setSize}
      className="flex min-h-24 min-w-0 cursor-default flex-col items-center justify-start gap-1 rounded-lg px-2 py-2 text-center data-[active=true]:bg-muted"
      data-active={active}
      id={domId}
      onClick={onSelect}
      onMouseEnter={onActivate}
      role="option"
    >
      <img
        alt=""
        aria-hidden="true"
        className="size-14 shrink-0 object-contain"
        decoding="async"
        loading="lazy"
        src={imageUrl}
      />
      <div className="line-clamp-2 text-[0.6875rem] leading-tight font-medium">
        {label}
      </div>
      {subtitle && (
        <div className="line-clamp-1 text-[0.5625rem] leading-tight text-muted-foreground">
          {subtitle}
        </div>
      )}
    </div>
  );
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
  recipe: Recipe;
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
  const outputItem = output ? findDescriptor(output.itemId) : undefined;
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
          src={buildableImageUrl(machine.id)}
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
    scope.type === "machine"
      ? findProductionMachine(scope.machineId)
      : undefined;
  const selectedExtractor =
    scope.type === "extractor"
      ? (findResourceExtractor(scope.extractorId) ??
        findResourceWellPressurizer(scope.extractorId))
      : undefined;
  const routeItem =
    scope.type === "routes" ? findDescriptor(scope.itemId) : undefined;
  const selectedConfigurableBuildable =
    scope.type === "configuration"
      ? findBuildable(scope.buildableId)
      : undefined;
  const rootScope = scope.type === "root";
  const rootQueryActive = rootScope && query.trim().length > 0;
  const matchingRecipes = useMemo(() => {
    if (
      !open ||
      scope.type === "extractor" ||
      scope.type === "configuration" ||
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
    () =>
      open && rootScope
        ? [
            ...searchExtractors(query).filter(
              (extractor) => extractor.resourceWell !== true,
            ),
            ...searchResourceWellPressurizers(query),
          ]
        : [],
    [open, query, rootScope],
  );
  const matchingLogistics = useMemo(
    () => (open && rootScope ? searchLogistics(query) : []),
    [open, query, rootScope],
  );
  const matchingPowerGenerators = useMemo(
    () => (open && rootScope ? searchPowerGenerators(query) : []),
    [open, query, rootScope],
  );
  const matchingBuffers = useMemo(
    () => (open && rootScope ? searchBuffers(query) : []),
    [open, query, rootScope],
  );
  const matchingTransports = useMemo(
    () => (open && rootScope ? searchTransports(query) : []),
    [open, query, rootScope],
  );
  const matchingSpecial = useMemo(
    () => (open && rootScope ? searchSpecialBuildables(query) : []),
    [open, query, rootScope],
  );
  const matchingExtractorResources = useMemo(
    () =>
      open && selectedExtractor
        ? resourcesForSource(selectedExtractor).filter((resource) =>
            includesSearchTerms(
              `${resource.name} ${resource.id} ${selectedExtractor.name}`,
              normalizedSearchTerms(query),
            ),
          )
        : [],
    [open, query, selectedExtractor],
  );
  const recentRows = useMemo(
    () =>
      rootScope && !rootQueryActive
        ? recentSelections.flatMap((selection) => {
            const buildable = findBuildable(selection.node.buildableId);
            if (!buildable) return [];
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
  const matchingConfigurations = useMemo(() => {
    if (!open || !selectedConfigurableBuildable) return [];
    const terms = normalizedSearchTerms(query);
    return configurationsForBuildable(selectedConfigurableBuildable).filter(
      (selection) => includesSearchTerms(selection.label, terms),
    );
  }, [open, query, selectedConfigurableBuildable]);

  const rows = useMemo(() => {
    const nextRows: PickerRow[] = [];
    const addHeading = (key: string, label: string) =>
      nextRows.push({ key: `heading:${key}`, label, type: "heading" });

    if (recentRows.length > 0) {
      addHeading("recent", "Recently used");
      nextRows.push({
        key: "grid:recent",
        layout: "recent",
        options: recentRows,
        type: "grid",
      });
    }

    if (!rootQueryActive && matchingLogistics.length > 0) {
      addHeading("logistics", "Logistics");
      nextRows.push({
        key: "grid:logistics",
        layout: "logistics",
        options: matchingLogistics
          .toSorted(
            (left, right) =>
              (LOGISTICS_QUICK_ADD_ORDER.get(left.id) ?? Number.MAX_VALUE) -
              (LOGISTICS_QUICK_ADD_ORDER.get(right.id) ?? Number.MAX_VALUE),
          )
          .map((buildable) => ({
            buildable,
            key: `buildable:${buildable.id}`,
            type: "buildable" as const,
          })),
        type: "grid",
      });
    }

    if (matchingMachines.length > 0 || matchingExtractors.length > 0) {
      addHeading("production", "Production");
    }

    if (matchingMachines.length > 0) {
      matchingMachines.forEach((machine) =>
        nextRows.push({
          key: `machine:${machine.id}`,
          machine,
          type: "machine",
        }),
      );
    }

    if (matchingExtractors.length > 0) {
      matchingExtractors.forEach((extractor) =>
        nextRows.push({
          extractor,
          key: `extractor:${extractor.id}`,
          type: "extractor",
        }),
      );
    }

    if (matchingPowerGenerators.length > 0) {
      addHeading("power", "Power");
      matchingPowerGenerators.forEach((buildable) =>
        nextRows.push({
          buildable,
          key: `configurable-buildable:${buildable.id}`,
          type: "configurable-buildable",
        }),
      );
    }

    const addBuildables = (
      key: string,
      label: string,
      buildables: readonly Buildable[],
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

    if (rootQueryActive) {
      addBuildables("logistics", "Logistics", matchingLogistics);
    }
    addBuildables("organization", "Organization", matchingBuffers);
    if (matchingTransports.length > 0) {
      addHeading("transport", "Transport");
      matchingTransports.forEach((buildable) =>
        nextRows.push({
          buildable,
          key: `configurable-buildable:${buildable.id}`,
          type: "configurable-buildable",
        }),
      );
    }
    addBuildables("special", "Special", matchingSpecial);

    if (selectedConfigurableBuildable && matchingConfigurations.length > 0) {
      addHeading("configurations", "Configurations");
      matchingConfigurations.forEach((selection) =>
        nextRows.push({
          buildable: selectedConfigurableBuildable,
          key: `configuration:${selectionKey(selection)}`,
          selection,
          type: "configuration",
        }),
      );
    }

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
          selectedMachine ?? findProductionMachine(recipe.machineIds[0]);
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
    matchingBuffers,
    matchingConfigurations,
    matchingExtractors,
    matchingLogistics,
    matchingMachines,
    matchingPowerGenerators,
    matchingRecipes,
    matchingSpecial,
    matchingTransports,
    matchingExtractorResources,
    recentRows,
    selectedConfigurableBuildable,
    selectedExtractor,
    selectedMachine,
  ]);

  const selectableEntries = useMemo(
    () =>
      rows.flatMap((row, rowIndex) =>
        optionsForRow(row).map((option) => ({ option, rowIndex })),
      ),
    [rows],
  );
  const selectablePositionByKey = useMemo(
    () =>
      new Map(
        selectableEntries.map(({ option }, index) => [option.key, index + 1]),
      ),
    [selectableEntries],
  );
  const selectedOptionIndex = selectableEntries.findIndex(
    ({ option }) => option.key === activeKey,
  );
  const activeOptionIndex = selectedOptionIndex >= 0 ? selectedOptionIndex : 0;
  const activeEntry = selectableEntries[activeOptionIndex];
  const activeOption = activeEntry?.option;
  const activeRowIndex = activeEntry?.rowIndex ?? -1;

  const rangeExtractor = (range: Range) => {
    const indices = defaultRangeExtractor(range);
    if (activeRowIndex < 0 || indices.includes(activeRowIndex)) return indices;
    return [...indices, activeRowIndex].toSorted((left, right) => left - right);
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
    if (!activeOption) {
      setActiveKey(null);
      return;
    }
    if (selectedOptionIndex < 0) setActiveKey(activeOption.key);
  }, [activeOption, selectedOptionIndex]);

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

  const selectRecipe = (recipe: Recipe, machineId: string) => {
    submitSelection({
      label: recipe.name,
      node: {
        buildableId: machineId,
        kind: "process",
        processId: recipe.id,
      },
    });
  };

  const selectBuildable = (buildable: Buildable) => {
    if (findRouter(buildable.id)) {
      submitSelection({
        label: buildable.name,
        node: { buildableId: buildable.id, kind: "router" },
      });
      return;
    }
    if (findBuffer(buildable.id)) {
      submitSelection({
        label: buildable.name,
        node: { buildableId: buildable.id, kind: "buffer" },
      });
      return;
    }
    const process = productionProcessesForBuildable(buildable.id)[0];
    if (!process) return;
    submitSelection({
      label: buildable.name,
      node: {
        buildableId: buildable.id,
        kind: "process",
        processId: process.id,
      },
    });
  };

  const selectExtractorResource = (
    extractor: ResourceSource,
    resource: Descriptor,
  ) => {
    const process = productionProcessesForBuildable(extractor.id).find(
      (candidate) =>
        (candidate.kind === "extraction" ||
          candidate.kind === "resource-well") &&
        candidate.outputItemIds.includes(resource.id),
    );
    if (!process) return;
    submitSelection({
      label: resource.name,
      node: {
        buildableId: extractor.id,
        kind: "process",
        processId: process.id,
      },
    });
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

  const selectOption = (option: PickerOption) => {
    if (option.type === "recent") {
      submitSelection(option.selection);
    } else if (option.type === "machine") {
      enterScope({ machineId: option.machine.id, type: "machine" });
    } else if (option.type === "extractor") {
      const resources = resourcesForSource(option.extractor);
      if (resources.length > 1) {
        enterScope({ extractorId: option.extractor.id, type: "extractor" });
      } else if (resources[0]) {
        selectExtractorResource(option.extractor, resources[0]);
      } else {
        selectBuildable(option.extractor);
      }
    } else if (option.type === "extractor-resource") {
      selectExtractorResource(option.extractor, option.resource);
    } else if (option.type === "configurable-buildable") {
      enterScope({
        buildableId: option.buildable.id,
        type: "configuration",
      });
    } else if (option.type === "configuration") {
      submitSelection(option.selection);
    } else if (option.type === "buildable") {
      selectBuildable(option.buildable);
    } else if (option.type === "recipe") {
      selectRecipe(option.recipe, option.machine.id);
    }
  };

  const activateOption = (index: number) => {
    const entry = selectableEntries[index];
    if (!entry) return;
    setActiveKey(entry.option.key);
    rowVirtualizer.scrollToIndex(entry.rowIndex, { align: "auto" });
  };

  const moveActive = (direction: -1 | 1) => {
    if (selectableEntries.length === 0) return;
    activateOption(
      Math.min(
        selectableEntries.length - 1,
        Math.max(0, activeOptionIndex + direction),
      ),
    );
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      selectOption(activeOption);
    }
  };

  const heading = selectedMachine
    ? selectedMachine.name
    : selectedExtractor
      ? selectedExtractor.name
      : selectedConfigurableBuildable
        ? selectedConfigurableBuildable.name
        : routeItem
          ? `${routeItem.name} Recipes`
          : undefined;
  const headingImage = selectedMachine
    ? buildableImageUrl(selectedMachine.id)
    : selectedExtractor
      ? buildableImageUrl(selectedExtractor.id)
      : selectedConfigurableBuildable
        ? buildableImageUrl(selectedConfigurableBuildable.id)
        : routeItem
          ? descriptorImageUrl(routeItem.id)
          : undefined;

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
                {selectedConfigurableBuildable
                  ? "Select a configuration"
                  : "Select a recipe"}
              </div>
            </div>
          </div>
        )}
        <div className="p-1 pb-0">
          <InputGroup className="h-8! bg-input/20 dark:bg-input/30">
            <input
              aria-activedescendant={
                activeOption ? optionDomId(listId, activeOption.key) : undefined
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
                    : selectedConfigurableBuildable
                      ? `Search ${selectedConfigurableBuildable.name} configurations...`
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
                const active = row.key === activeKey;
                const domId = optionDomId(listId, row.key);
                const position = selectablePositionByKey.get(row.key) ?? 0;
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
                    ) : row.type === "grid" ? (
                      <div
                        className={cn(
                          "grid gap-1.5 pb-4",
                          row.layout === "recent"
                            ? "no-scrollbar grid-flow-col auto-cols-[6.5rem] justify-start overflow-x-auto sm:auto-cols-[7.5rem]"
                            : "grid-cols-3 sm:grid-cols-5",
                        )}
                      >
                        {row.options.map((option) => {
                          const tileBuildable = option.buildable;
                          const tileLabel =
                            option.type === "recent"
                              ? option.selection.label
                              : option.buildable.name;
                          const tileSubtitle =
                            option.type === "recent" &&
                            option.selection.label !== option.buildable.name
                              ? option.buildable.name
                              : undefined;
                          return (
                            <PickerTile
                              active={option.key === activeKey}
                              domId={optionDomId(listId, option.key)}
                              imageUrl={
                                buildableImageUrl(tileBuildable.id) ?? ""
                              }
                              key={option.key}
                              label={tileLabel}
                              onActivate={() => setActiveKey(option.key)}
                              onSelect={() => selectOption(option)}
                              position={
                                selectablePositionByKey.get(option.key) ?? 0
                              }
                              setSize={selectableEntries.length}
                              subtitle={tileSubtitle}
                            />
                          );
                        })}
                      </div>
                    ) : row.type === "machine" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableEntries.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectOption(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={buildableImageUrl(row.machine.id)}
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
                              "Production",
                              ["production", "machine"],
                            )}
                          />
                        </div>
                      </div>
                    ) : row.type === "extractor" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableEntries.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectOption(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={buildableImageUrl(row.extractor.id)}
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
                        aria-setsize={selectableEntries.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectOption(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={buildableImageUrl(row.extractor.id)}
                        />
                        <div className="font-medium">
                          <HighlightedText
                            query={query}
                            text={row.resource.name}
                          />
                        </div>
                      </div>
                    ) : row.type === "buildable" ||
                      row.type === "configurable-buildable" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableEntries.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectOption(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={buildableImageUrl(row.buildable.id)}
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
                    ) : row.type === "configuration" ? (
                      <div
                        aria-posinset={position}
                        aria-selected={active}
                        aria-setsize={selectableEntries.length}
                        className="flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-xs/relaxed data-[active=true]:bg-muted"
                        data-active={active}
                        id={domId}
                        onClick={() => selectOption(row)}
                        onMouseEnter={() => setActiveKey(row.key)}
                        role="option"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className="size-14 object-contain"
                          decoding="async"
                          loading="lazy"
                          src={buildableImageUrl(row.buildable.id)}
                        />
                        <div className="font-medium">
                          <HighlightedText
                            query={query}
                            text={row.selection.label}
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
                        onSelect={() => selectOption(row)}
                        position={position}
                        query={query}
                        recipe={row.recipe}
                        setSize={selectableEntries.length}
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
