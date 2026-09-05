import {
  createNode,
  findBuffer,
  findBuildable,
  findDescriptor,
  findPowerGenerator,
  findProductionMachine,
  findResourceExtractor,
  findResourceWellPressurizer,
  listDescriptors,
  type Descriptor,
  type NodeConfiguration,
  type ProcessNodeConfiguration,
  type ResourcePurity,
} from "@satisfactory-belt/production";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Minus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { CanvasEditor } from "@/canvas/editor";
import type { CanvasNode } from "@/canvas/document";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildableImage,
  descriptorImage,
  imageSrcSet,
  selectImageUrl,
  type ResponsiveImage,
} from "@/game/catalog-images";
import { cn } from "@/lib/utils";

const MAX_INSTANCE_COUNT = 999;
const PURITIES: readonly ResourcePurity[] = ["impure", "normal", "pure"];
const MINER_TIERS = [
  { label: "Mk.1", value: "Build_MinerMk1_C" },
  { label: "Mk.2", value: "Build_MinerMk2_C" },
  { label: "Mk.3", value: "Build_MinerMk3_C" },
] as const;
const ROUTER_RULES = [
  { label: "Any", value: "any" },
  { label: "Any undefined", value: "any-undefined" },
  { label: "Overflow", value: "overflow" },
] as const;
const DESCRIPTORS = listDescriptors().toSorted((left, right) =>
  left.name.localeCompare(right.name),
);
const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

type InspectorScope = "all" | number;

type InspectorInstance = Readonly<{
  clockSpeedPercent?: number;
  id: string;
  resourcePurity?: ResourcePurity;
  satellites?: readonly Readonly<{
    id: string;
    resourcePurity: ResourcePurity;
  }>[];
  somersloopCount?: number;
}>;

function formatNumber(value: number) {
  return numberFormatter.format(Math.abs(value) < 0.005 ? 0 : value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function commonValue<T>(
  instances: readonly InspectorInstance[],
  value: (instance: InspectorInstance) => T,
): T | "mixed" {
  const first = value(instances[0]!);
  return instances.every((instance) => Object.is(value(instance), first))
    ? first
    : "mixed";
}

function CatalogImage({
  className,
  image,
  size,
}: Readonly<{
  className?: string;
  image: ResponsiveImage | undefined;
  size: number;
}>) {
  if (!image) return null;
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("object-contain", className)}
      decoding="async"
      sizes={`${size}px`}
      src={selectImageUrl(image, size * 2)}
      srcSet={imageSrcSet(image)}
    />
  );
}

type DescriptorPickerOption = Readonly<{
  label: string;
  value?: string;
}>;

function DescriptorPicker({
  allowedForms,
  buttonLabel,
  label,
  onChange,
  specialOptions = [],
  value,
}: Readonly<{
  allowedForms: readonly Descriptor["form"][];
  buttonLabel?: string;
  label: string;
  onChange: (value: string | undefined) => void;
  specialOptions?: readonly DescriptorPickerOption[];
  value?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const descriptor = value ? findDescriptor(value) : undefined;
  const special = specialOptions.find((option) => option.value === value);
  const currentLabel =
    buttonLabel ?? descriptor?.name ?? special?.label ?? label;
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const descriptors = DESCRIPTORS.filter(
    (candidate) =>
      allowedForms.includes(candidate.form) &&
      terms.every((term) => candidate.name.toLocaleLowerCase().includes(term)),
  ).slice(0, 50);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery("");
  };

  return (
    <>
      <Button
        aria-label={label}
        className="min-w-0 justify-start"
        onClick={() => handleOpenChange(true)}
        type="button"
        variant="outline"
      >
        {descriptor && (
          <CatalogImage
            className="size-4 shrink-0"
            image={descriptorImage(descriptor.id)}
            size={16}
          />
        )}
        <span className="truncate">{currentLabel}</span>
      </Button>
      <CommandDialog
        description={`Choose a material or routing rule for ${label}.`}
        onOpenChange={handleOpenChange}
        open={open}
        showCloseButton
        title={label}
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            onValueChange={setQuery}
            placeholder="Search materials…"
            value={query}
          />
          <CommandList>
            <CommandEmpty>No matching materials.</CommandEmpty>
            {specialOptions.length > 0 && (
              <CommandGroup heading="Rules">
                {specialOptions.map((option) => (
                  <CommandItem
                    data-checked={option.value === value}
                    key={option.value ?? "automatic"}
                    onSelect={() => {
                      onChange(option.value);
                      handleOpenChange(false);
                    }}
                    value={`rule ${option.label}`}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Materials">
              {descriptors.map((option) => (
                <CommandItem
                  data-checked={option.id === value}
                  key={option.id}
                  onSelect={() => {
                    onChange(option.id);
                    handleOpenChange(false);
                  }}
                  value={`${option.name} ${option.id}`}
                >
                  <CatalogImage
                    className="size-5"
                    image={descriptorImage(option.id)}
                    size={20}
                  />
                  <span className="truncate">{option.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function Section({
  children,
  title,
}: Readonly<{ children: ReactNode; title?: string }>) {
  return (
    <section className="border-t border-border px-3 py-3">
      {title && (
        <h3 className="mb-2 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

function NumberStepper({
  label,
  maximum,
  minimum,
  onChange,
  step = 1,
  suffix,
  value,
}: Readonly<{
  label: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  value: number | "mixed";
}>) {
  const numericValue = value === "mixed" ? undefined : value;
  const changeBy = (delta: number) => {
    if (numericValue === undefined) return;
    onChange(clamp(numericValue + delta, minimum, maximum));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <label
        className="text-xs font-medium"
        htmlFor={`node-inspector-${label.replaceAll(" ", "-").toLowerCase()}`}
      >
        {label}
      </label>
      <div className="flex items-center rounded-md focus-within:ring-2 focus-within:ring-ring/30">
        <Button
          aria-label={`Decrease ${label}`}
          className="rounded-r-none"
          disabled={numericValue === undefined || numericValue <= minimum}
          onClick={() => changeBy(-step)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Minus aria-hidden="true" />
        </Button>
        <div className="relative">
          <Input
            aria-label={label}
            className={cn(
              "h-7 w-20 rounded-none border-x-0 text-center tabular-nums focus-visible:border-input focus-visible:ring-0",
              suffix && "pr-6",
            )}
            id={`node-inspector-${label.replaceAll(" ", "-").toLowerCase()}`}
            max={maximum}
            min={minimum}
            onChange={(event) => {
              if (event.currentTarget.value.trim() === "") return;
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) {
                onChange(clamp(next, minimum, maximum));
              }
            }}
            inputMode="decimal"
            placeholder={value === "mixed" ? "Mixed" : undefined}
            step={step}
            type="text"
            value={numericValue ?? ""}
          />
          {suffix && numericValue !== undefined && (
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[0.625rem] text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
        <Button
          aria-label={`Increase ${label}`}
          className="rounded-l-none"
          disabled={numericValue === undefined || numericValue >= maximum}
          onClick={() => changeBy(step)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  onChange,
  options,
  value,
}: Readonly<{
  label: string;
  onChange: (value: T) => void;
  options: readonly Readonly<{ label: string; value: T }>[];
  value: T | "mixed";
}>) {
  return (
    <div className="grid gap-2">
      <div className="flex h-7 items-center text-xs font-medium">{label}</div>
      <div
        className="grid grid-flow-col auto-cols-fr gap-1"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <Button
            aria-pressed={value === option.value}
            className="min-w-0"
            key={option.value}
            onClick={() => onChange(option.value)}
            size="sm"
            type="button"
            variant={value === option.value ? "secondary" : "outline"}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {value === "mixed" && (
        <div className="text-[0.625rem] text-muted-foreground">
          Mixed values—choose one to apply it to every machine.
        </div>
      )}
    </div>
  );
}

function SomersloopSelect({
  maximum,
  onChange,
  value,
}: Readonly<{
  maximum: number;
  onChange: (value: number) => void;
  value: number | "mixed";
}>) {
  const options = Array.from({ length: maximum + 1 }, (_, count) => ({
    label: `${count} / ${maximum}`,
    value: count,
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <span className="text-xs font-medium">Somersloops</span>
      <Select
        items={options}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        value={value === "mixed" ? null : value}
      >
        <SelectTrigger
          aria-label="Somersloops"
          className="w-[8.5rem]"
          size="sm"
        >
          <SelectValue>
            {(selected: number | null) =>
              selected === null
                ? `Mixed / ${maximum}`
                : `${selected} / ${maximum}`
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function clockRange(configuration: ProcessNodeConfiguration) {
  const machine = findProductionMachine(configuration.buildableId);
  if (machine) return machine.clockSpeed;
  const extractor = findResourceExtractor(configuration.buildableId);
  if (extractor && extractor.resourceWell !== true) return extractor.clockSpeed;
  const generator = findPowerGenerator(configuration.buildableId);
  if (generator?.generatorKind === "fuel") return generator.clockSpeed;
  return findResourceWellPressurizer(configuration.buildableId)?.clockSpeed;
}

function newInstanceId() {
  return crypto.randomUUID();
}

function cloneInstance(instance: InspectorInstance): InspectorInstance {
  return {
    ...instance,
    id: newInstanceId(),
    ...(instance.satellites
      ? {
          satellites: instance.satellites.map((satellite) => ({
            ...satellite,
            id: newInstanceId(),
          })),
        }
      : {}),
  };
}

function ProcessControls({
  configuration,
  editor,
  nodeId,
  scope,
}: Readonly<{
  configuration: ProcessNodeConfiguration;
  editor: CanvasEditor;
  nodeId: string;
  scope: InspectorScope;
}>) {
  const instances = configuration.instances as readonly InspectorInstance[];
  const scopedInstances =
    scope === "all" ? instances : [instances[scope] ?? instances[0]!];
  const range = clockRange(configuration);
  const machine = findProductionMachine(configuration.buildableId);
  const maximumSomersloops =
    machine?.productionAmplification?.somersloopSlots ?? 0;
  const hasClock =
    range !== undefined &&
    scopedInstances.every(
      (instance) => instance.clockSpeedPercent !== undefined,
    );
  const hasSomersloops =
    maximumSomersloops > 0 &&
    scopedInstances.every((instance) => instance.somersloopCount !== undefined);
  const hasPurity = scopedInstances.every(
    (instance) => instance.resourcePurity !== undefined,
  );
  const isMiner = MINER_TIERS.some(
    (tier) => tier.value === configuration.buildableId,
  );

  const configureInstances = (
    update: (instance: InspectorInstance) => InspectorInstance,
  ) => {
    const next = instances.map((instance, index) =>
      scope === "all" || scope === index ? update(instance) : instance,
    );
    editor.dispatch({
      type: "node.configure",
      configuration: { ...configuration, instances: next } as NodeConfiguration,
      id: nodeId,
    });
  };

  const setInstanceCount = (count: number) => {
    const next = [...instances];
    while (next.length > count) next.pop();
    while (next.length < count) next.push(cloneInstance(next.at(-1)!));
    editor.dispatch({
      type: "node.configure",
      configuration: { ...configuration, instances: next } as NodeConfiguration,
      id: nodeId,
    });
  };

  return (
    <Section title="Configuration">
      <div className="grid gap-3">
        {scope === "all" && (
          <NumberStepper
            label="Machine count"
            maximum={MAX_INSTANCE_COUNT}
            minimum={1}
            onChange={(value) => setInstanceCount(Math.round(value))}
            value={instances.length}
          />
        )}
        {hasClock && range && (
          <NumberStepper
            label="Clock speed"
            maximum={range.maximumPercent}
            minimum={range.minimumPercent}
            onChange={(value) =>
              configureInstances((instance) => ({
                ...instance,
                clockSpeedPercent: value,
              }))
            }
            suffix="%"
            value={commonValue(
              scopedInstances,
              (instance) => instance.clockSpeedPercent!,
            )}
          />
        )}
        {hasSomersloops && (
          <SomersloopSelect
            maximum={maximumSomersloops}
            onChange={(value) =>
              configureInstances((instance) => ({
                ...instance,
                somersloopCount: value,
              }))
            }
            value={commonValue(
              scopedInstances,
              (instance) => instance.somersloopCount!,
            )}
          />
        )}
        {isMiner && scope === "all" && (
          <SegmentedControl
            label="Miner tier"
            onChange={(buildableId) =>
              editor.dispatch({
                type: "node.configure",
                configuration: { ...configuration, buildableId },
                id: nodeId,
              })
            }
            options={MINER_TIERS}
            value={configuration.buildableId}
          />
        )}
        {hasPurity && (
          <SegmentedControl
            label="Resource purity"
            onChange={(value) =>
              configureInstances((instance) => ({
                ...instance,
                resourcePurity: value,
              }))
            }
            options={PURITIES.map((purity) => ({
              label: purity[0]!.toUpperCase() + purity.slice(1),
              value: purity,
            }))}
            value={commonValue(
              scopedInstances,
              (instance) => instance.resourcePurity!,
            )}
          />
        )}
      </div>
    </Section>
  );
}

function ScopeSelector({
  count,
  onChange,
  scope,
}: Readonly<{
  count: number;
  onChange: (scope: InspectorScope) => void;
  scope: InspectorScope;
}>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scopeIndex = scope === "all" ? 0 : scope + 1;
  const scopes: readonly InspectorScope[] = [
    "all",
    ...Array.from({ length: count }, (_, index) => index),
  ];

  useEffect(() => {
    const selected = scrollerRef.current?.querySelector<HTMLElement>(
      "[aria-pressed='true']",
    );
    selected?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [scope]);

  return (
    <div className="flex items-center gap-1 border-t border-border px-2 py-2">
      <Button
        aria-label="Previous machine"
        disabled={scopeIndex === 0}
        onClick={() => onChange(scopes[scopeIndex - 1]!)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <div
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={scrollerRef}
      >
        {scopes.map((option) => {
          const selected = scope === option;
          const label = option === "all" ? "All" : String(option + 1);
          return (
            <Button
              aria-label={
                option === "all"
                  ? "Edit all machines"
                  : `Edit machine ${option + 1}`
              }
              aria-pressed={selected}
              className={cn("shrink-0", option === "all" && "px-3")}
              key={option}
              onClick={() => onChange(option)}
              size="sm"
              type="button"
              variant={selected ? "secondary" : "ghost"}
            >
              {label}
            </Button>
          );
        })}
      </div>
      <Button
        aria-label="Next machine"
        disabled={scopeIndex === scopes.length - 1}
        onClick={() => onChange(scopes[scopeIndex + 1]!)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

function formatPowerRange(
  range: Readonly<{ maximumMw: number; minimumMw: number }>,
) {
  return range.minimumMw === range.maximumMw
    ? `${formatNumber(range.minimumMw)} MW`
    : `${formatNumber(range.minimumMw)}–${formatNumber(range.maximumMw)} MW`;
}

type RateMaterial = Readonly<{
  itemId: string;
  portId: string;
  ratePerMinute: number;
}>;

function orderedMaterials(
  materials: readonly Readonly<{ itemId: string; ratePerMinute: number }>[],
  direction: "input" | "output",
  order: readonly string[] | undefined,
): readonly RateMaterial[] {
  const mapped = materials.map((material) => ({
    ...material,
    portId: `${direction}:${material.itemId}`,
  }));
  const rank = new Map(order?.map((portId, index) => [portId, index]));
  return mapped.toSorted(
    (left, right) =>
      (rank.get(left.portId) ?? mapped.length) -
      (rank.get(right.portId) ?? mapped.length),
  );
}

function RateColumn({
  direction,
  materials,
  onMove,
}: Readonly<{
  direction: "input" | "output";
  materials: readonly RateMaterial[];
  onMove: (index: number, delta: -1 | 1) => void;
}>) {
  const title = direction === "input" ? "Inputs" : "Outputs";
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "mb-2 text-[0.625rem] font-medium tracking-wide uppercase",
          direction === "input" ? "text-[#b8794f]" : "text-[#5a9b8c]",
        )}
      >
        {title}
      </div>
      {materials.length > 0 && (
        <div className="grid gap-2">
          {materials.map((material, index) => {
            const item = findDescriptor(material.itemId);
            return (
              <div
                className="group/rate grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-1.5"
                key={material.portId}
              >
                <CatalogImage
                  className="size-6"
                  image={descriptorImage(material.itemId)}
                  size={24}
                />
                <div className="min-w-0 text-xs">
                  <div className="truncate" title={item?.name}>
                    {item?.name ?? material.itemId}
                  </div>
                  <div className="text-[0.625rem] tabular-nums text-muted-foreground">
                    {formatNumber(material.ratePerMinute)} /min
                  </div>
                </div>
                {materials.length > 1 && (
                  <div className="grid">
                    <Button
                      aria-label={`Move ${item?.name ?? material.itemId} up`}
                      disabled={index === 0}
                      onClick={() => onMove(index, -1)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`Move ${item?.name ?? material.itemId} down`}
                      disabled={index === materials.length - 1}
                      onClick={() => onMove(index, 1)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NodeMetrics({
  editor,
  node: canvasNode,
  scope,
}: Readonly<{
  editor: CanvasEditor;
  node: CanvasNode;
  scope: InspectorScope;
}>) {
  const configuration = canvasNode.configuration;
  const scopedConfiguration =
    configuration.kind === "process" && scope !== "all"
      ? ({
          ...configuration,
          instances: [
            configuration.instances[scope] ?? configuration.instances[0]!,
          ],
        } as NodeConfiguration)
      : configuration;
  const node = createNode(scopedConfiguration);
  const inputs =
    node.profile.materials.kind === "calculated"
      ? orderedMaterials(
          node.profile.materials.inputs,
          "input",
          canvasNode.portOrder?.input,
        )
      : [];
  const outputs =
    node.profile.materials.kind === "calculated"
      ? orderedMaterials(
          node.profile.materials.outputs,
          "output",
          canvasNode.portOrder?.output,
        )
      : [];
  const consumed = node.profile.power.consumed;
  const produced = node.profile.power.produced;
  const hasPower = consumed.maximumMw > 0 || produced.maximumMw > 0;
  if (inputs.length === 0 && outputs.length === 0 && !hasPower) return null;

  const move = (
    direction: "input" | "output",
    materials: readonly RateMaterial[],
    index: number,
    delta: -1 | 1,
  ) => {
    const portIds = materials.map((material) => material.portId);
    const target = index + delta;
    [portIds[index], portIds[target]] = [portIds[target]!, portIds[index]!];
    editor.dispatch({
      type: "node.ports.reorder",
      direction,
      id: configuration.id,
      portIds,
    });
  };

  return (
    <Section>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <RateColumn
          direction="input"
          materials={inputs}
          onMove={(index, delta) => move("input", inputs, index, delta)}
        />
        <RateColumn
          direction="output"
          materials={outputs}
          onMove={(index, delta) => move("output", outputs, index, delta)}
        />
        {consumed.maximumMw > 0 && (
          <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
            <span className="text-muted-foreground">Power consumption</span>
            <span className="tabular-nums">{formatPowerRange(consumed)}</span>
          </div>
        )}
        {produced.maximumMw > 0 && (
          <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
            <span className="text-muted-foreground">Power production</span>
            <span className="tabular-nums">{formatPowerRange(produced)}</span>
          </div>
        )}
      </div>
    </Section>
  );
}

function TransportControls({
  configuration,
  editor,
}: Readonly<{
  configuration: Extract<NodeConfiguration, { kind: "transport" }>;
  editor: CanvasEditor;
}>) {
  return (
    <Section title="Configuration">
      <SegmentedControl
        label="Mode"
        onChange={(mode) =>
          editor.dispatch({
            type: "node.configure",
            configuration: { ...configuration, mode },
            id: configuration.id,
          })
        }
        options={[
          { label: "Load", value: "load" },
          { label: "Unload", value: "unload" },
        ]}
        value={configuration.mode}
      />
    </Section>
  );
}

function configurationWithItem(
  configuration: Extract<
    NodeConfiguration,
    { kind: "buffer" | "router" | "transport" }
  >,
  itemId: string | undefined,
) {
  const { itemId: _currentItemId, ...base } = configuration;
  return itemId ? { ...base, itemId } : base;
}

function BufferControls({
  configuration,
  editor,
}: Readonly<{
  configuration: Extract<NodeConfiguration, { kind: "buffer" }>;
  editor: CanvasEditor;
}>) {
  const buffer = findBuffer(configuration.buildableId);
  const forms = [...new Set(buffer?.ports.flatMap((port) => port.forms) ?? [])];
  return (
    <Section title="Configuration">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
        <div>
          <div className="text-xs font-medium">Stored material</div>
          <div className="text-[0.625rem] text-muted-foreground">
            Optional—otherwise inferred from connections.
          </div>
        </div>
        <DescriptorPicker
          allowedForms={forms}
          label="Stored material"
          onChange={(itemId) =>
            editor.dispatch({
              type: "node.configure",
              configuration: configurationWithItem(configuration, itemId),
              id: configuration.id,
            })
          }
          specialOptions={[{ label: "Automatic" }]}
          value={configuration.itemId}
        />
      </div>
    </Section>
  );
}

function ruleLabel(rule: string) {
  return (
    ROUTER_RULES.find((option) => option.value === rule)?.label ??
    findDescriptor(rule)?.name ??
    rule
  );
}

function RouterControls({
  editor,
  node: canvasNode,
}: Readonly<{ editor: CanvasEditor; node: CanvasNode }>) {
  const configuration = canvasNode.configuration;
  if (configuration.kind !== "router") return null;
  const programmable = configuration.buildableId.includes(
    "SplitterProgrammable",
  );
  const priorityMerger = configuration.buildableId.includes("MergerPriority");
  const smart = configuration.buildableId.includes("SplitterSmart");
  if (!programmable && !priorityMerger && !smart) return null;
  if (priorityMerger) {
    const inputs = createNode(configuration).ports.filter(
      (port) => port.direction === "input",
    );
    return (
      <Section title="Input priorities">
        <div className="grid gap-3">
          {inputs.map((port, index) => {
            const label =
              inputs.length === 3
                ? (["Top input", "Middle input", "Bottom input"][index] ??
                  `Input ${index + 1}`)
                : `Input ${index + 1}`;
            return (
              <SegmentedControl
                key={port.id}
                label={label}
                onChange={(priority) =>
                  editor.dispatch({
                    type: "node.router.priorities",
                    id: configuration.id,
                    priorities: {
                      ...canvasNode.routerPriorities,
                      [port.id]: priority,
                    },
                  })
                }
                options={[
                  { label: "Low", value: "low" },
                  { label: "Medium", value: "medium" },
                  { label: "High", value: "high" },
                ]}
                value={canvasNode.routerPriorities?.[port.id] ?? "low"}
              />
            );
          })}
        </div>
      </Section>
    );
  }
  const outputs = createNode(configuration).ports.filter(
    (port) => port.direction === "output",
  );

  const setRules = (portId: string, rules: readonly string[]) => {
    editor.dispatch({
      type: "node.router.rules",
      id: configuration.id,
      rules: { ...canvasNode.routerRules, [portId]: rules },
    });
  };

  return (
    <Section title="Routing">
      <div className="grid gap-3">
        {outputs.map((port, index) => {
          const rules = canvasNode.routerRules?.[port.id] ?? ["any"];
          const label =
            outputs.length === 3
              ? (["Top output", "Middle output", "Bottom output"][index] ??
                `Output ${index + 1}`)
              : `Output ${index + 1}`;
          if (smart) {
            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3"
                key={port.id}
              >
                <span className="text-xs font-medium">{label}</span>
                <DescriptorPicker
                  allowedForms={["solid"]}
                  label={`${label} rule`}
                  onChange={(rule) => setRules(port.id, [rule ?? "any"])}
                  specialOptions={ROUTER_RULES}
                  value={rules[0] ?? "any"}
                />
              </div>
            );
          }
          return (
            <div className="grid gap-1.5" key={port.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{label}</span>
                <DescriptorPicker
                  allowedForms={["solid"]}
                  buttonLabel="Add rule"
                  label={`Add ${label} rule`}
                  onChange={(rule) => {
                    if (!rule) return;
                    const next =
                      rules.length === 1 && rules[0] === "any"
                        ? [rule]
                        : [...new Set([...rules, rule])];
                    setRules(port.id, next);
                  }}
                  specialOptions={ROUTER_RULES}
                />
              </div>
              {rules.length === 0 ? (
                <span className="text-[0.625rem] text-muted-foreground">
                  No rules—this output is blocked.
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {rules.map((rule) => (
                    <span
                      className="inline-flex h-6 items-center gap-1 rounded-md bg-secondary pl-2 text-[0.625rem]"
                      key={rule}
                    >
                      {ruleLabel(rule)}
                      <Button
                        aria-label={`Remove ${ruleLabel(rule)} from ${label}`}
                        onClick={() =>
                          setRules(
                            port.id,
                            rules.filter((candidate) => candidate !== rule),
                          )
                        }
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function InspectorContent({
  editor,
  keyboardEditing,
  node,
  onSheetHandlePointerCancel,
  onSheetHandlePointerDown,
  onSheetHandlePointerMove,
  onSheetHandlePointerUp,
}: Readonly<{
  editor: CanvasEditor;
  keyboardEditing: boolean;
  node: CanvasNode;
  onSheetHandlePointerCancel: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSheetHandlePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSheetHandlePointerMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSheetHandlePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}>) {
  const [scope, setScope] = useState<InspectorScope>("all");
  const configuration = node.configuration;
  const instances =
    configuration.kind === "process" ? configuration.instances : [];
  const safeScope = scope === "all" || scope < instances.length ? scope : "all";
  const buildable = findBuildable(configuration.buildableId);

  useEffect(() => setScope("all"), [configuration.id]);

  return (
    <>
      <button
        aria-label="Drag down to close node details"
        className="flex h-5 w-full shrink-0 touch-none cursor-ns-resize items-center justify-center lg:hidden"
        onPointerCancel={onSheetHandlePointerCancel}
        onPointerDown={onSheetHandlePointerDown}
        onPointerMove={onSheetHandlePointerMove}
        onPointerUp={onSheetHandlePointerUp}
        type="button"
      >
        <span className="h-1 w-9 rounded-full bg-border" />
      </button>
      <header className="flex min-w-0 items-center gap-3 px-3 py-2.5">
        <CatalogImage
          className="size-12 shrink-0"
          image={buildableImage(configuration.buildableId)}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" title={node.label}>
            {node.label}
          </h2>
          <div className="truncate text-xs text-muted-foreground">
            {configuration.kind === "process"
              ? `${instances.length}× ${buildable?.name ?? "Buildable"}`
              : (buildable?.name ?? "Buildable")}
          </div>
        </div>
        <Button
          aria-label="Close node details"
          onClick={() => editor.dispatch({ type: "selection.clear" })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      {configuration.kind === "process" && (
        <ScopeSelector
          count={instances.length}
          onChange={setScope}
          scope={safeScope}
        />
      )}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overscroll-contain [&_[data-slot=scroll-area-viewport]]:scroll-py-3">
        {configuration.kind === "process" && (
          <ProcessControls
            configuration={configuration}
            editor={editor}
            nodeId={configuration.id}
            scope={safeScope}
          />
        )}
        {configuration.kind === "transport" && (
          <TransportControls configuration={configuration} editor={editor} />
        )}
        {configuration.kind === "buffer" && (
          <BufferControls configuration={configuration} editor={editor} />
        )}
        {configuration.kind === "router" && (
          <RouterControls editor={editor} node={node} />
        )}
        <NodeMetrics editor={editor} node={node} scope={safeScope} />
      </ScrollArea>
      <footer
        className={cn(
          "relative z-10 flex shrink-0 justify-end gap-1 border-t border-border bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:pb-2",
          keyboardEditing && "hidden lg:flex",
        )}
      >
        <Button
          onClick={() => editor.dispatch({ type: "selection.duplicate" })}
          type="button"
          variant="ghost"
        >
          <CopyPlus aria-hidden="true" data-icon="inline-start" />
          Duplicate
        </Button>
        <Button
          onClick={() => editor.dispatch({ type: "selection.delete" })}
          type="button"
          variant="destructive"
        >
          <Trash2 aria-hidden="true" data-icon="inline-start" />
          Delete
        </Button>
      </footer>
    </>
  );
}

export function NodeInspector({ editor }: Readonly<{ editor: CanvasEditor }>) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  const selectedId =
    state.selectedIds.length === 1 ? state.selectedIds[0] : undefined;
  const [keyboardEditing, setKeyboardEditing] = useState(false);
  const [sheetOffset, setSheetOffset] = useState(0);
  const focusScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const sheetDragRef = useRef<{ offset: number; startY: number } | null>(null);
  useEffect(() => {
    sheetDragRef.current = null;
    setKeyboardEditing(false);
    setSheetOffset(0);
  }, [selectedId]);
  useEffect(
    () => () => {
      if (focusScrollTimerRef.current !== null) {
        clearTimeout(focusScrollTimerRef.current);
      }
    },
    [],
  );
  const node = selectedId
    ? state.document.nodes.find(
        (candidate) => candidate.configuration.id === selectedId,
      )
    : undefined;
  if (!node || state.moveDelta !== null) return null;

  const handleSheetPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetDragRef.current = { offset: 0, startY: event.clientY };
  };
  const handleSheetPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = sheetDragRef.current;
    if (!drag) return;
    drag.offset = Math.max(0, event.clientY - drag.startY);
    setSheetOffset(drag.offset);
  };
  const finishSheetDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const drag = sheetDragRef.current;
    if (!drag) return;
    sheetDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!cancelled && drag.offset >= 72) {
      editor.dispatch({ type: "selection.clear" });
      return;
    }
    setSheetOffset(0);
  };

  return (
    <aside
      aria-label={`Node details: ${node.label}`}
      className={cn(
        "pointer-events-auto absolute right-0 bottom-0 left-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border border-x-0 border-b-0 border-border bg-card text-card-foreground shadow-2xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[22rem] lg:rounded-xl lg:border-x lg:border-b lg:shadow-xl",
        keyboardEditing ? "max-h-[100dvh]" : "max-h-[82dvh]",
      )}
      onBlurCapture={(event) => {
        if (!(event.relatedTarget instanceof HTMLInputElement)) {
          setKeyboardEditing(false);
        }
      }}
      onFocusCapture={(event) => {
        if (!(event.target instanceof HTMLInputElement)) return;
        setKeyboardEditing(true);
        if (focusScrollTimerRef.current !== null) {
          clearTimeout(focusScrollTimerRef.current);
        }
        const input = event.target;
        focusScrollTimerRef.current = setTimeout(() => {
          focusScrollTimerRef.current = null;
          if (input.isConnected) {
            input.scrollIntoView({ block: "center", inline: "nearest" });
          }
        }, 250);
      }}
      style={{
        transform: sheetOffset > 0 ? `translateY(${sheetOffset}px)` : undefined,
        transition: sheetDragRef.current ? "none" : "transform 150ms ease-out",
      }}
    >
      <InspectorContent
        editor={editor}
        keyboardEditing={keyboardEditing}
        node={node}
        onSheetHandlePointerCancel={(event) => finishSheetDrag(event, true)}
        onSheetHandlePointerDown={handleSheetPointerDown}
        onSheetHandlePointerMove={handleSheetPointerMove}
        onSheetHandlePointerUp={(event) => finishSheetDrag(event, false)}
      />
    </aside>
  );
}
