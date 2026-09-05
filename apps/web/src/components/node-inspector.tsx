import {
  createNode,
  findBuildable,
  findDescriptor,
  findPowerGenerator,
  findProductionMachine,
  findResourceExtractor,
  findResourceWellPressurizer,
  type NodeConfiguration,
  type ProcessNodeConfiguration,
  type ResourcePurity,
} from "@satisfactory-belt/production";
import {
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
  type ReactNode,
} from "react";

import type { CanvasEditor } from "@/canvas/editor";
import type { CanvasNode } from "@/canvas/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function Section({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="border-t border-border px-3 py-3">
      <h3 className="mb-2 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
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
      <div className="flex items-center">
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
              "h-7 w-20 rounded-none border-x-0 text-center tabular-nums",
              suffix && "pr-6",
            )}
            id={`node-inspector-${label.replaceAll(" ", "-").toLowerCase()}`}
            max={maximum}
            min={minimum}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next)) {
                onChange(clamp(next, minimum, maximum));
              }
            }}
            placeholder={value === "mixed" ? "Mixed" : undefined}
            step={step}
            type="number"
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
      <div className="text-xs font-medium">{label}</div>
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
          <SegmentedControl
            label="Somersloops"
            onChange={(value) =>
              configureInstances((instance) => ({
                ...instance,
                somersloopCount: value,
              }))
            }
            options={Array.from(
              { length: maximumSomersloops + 1 },
              (_, value) => ({ label: String(value), value }),
            )}
            value={commonValue(
              scopedInstances,
              (instance) => instance.somersloopCount!,
            )}
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

function NodeMetrics({
  configuration,
  scope,
}: Readonly<{
  configuration: NodeConfiguration;
  scope: InspectorScope;
}>) {
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
  const materials =
    node.profile.materials.kind === "calculated"
      ? [
          ...node.profile.materials.inputs.map((material) => ({
            ...material,
            direction: "Input" as const,
          })),
          ...node.profile.materials.outputs.map((material) => ({
            ...material,
            direction: "Output" as const,
          })),
        ]
      : [];
  const consumed = node.profile.power.consumed;
  const produced = node.profile.power.produced;
  const hasPower = consumed.maximumMw > 0 || produced.maximumMw > 0;
  if (materials.length === 0 && !hasPower) return null;

  return (
    <Section title="Rates">
      <div className="grid gap-2">
        {materials.map((material) => {
          const item = findDescriptor(material.itemId);
          return (
            <div
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs"
              key={`${material.direction}:${material.itemId}`}
            >
              <CatalogImage
                className="size-6"
                image={descriptorImage(material.itemId)}
                size={24}
              />
              <div className="min-w-0">
                <div className="truncate">{item?.name ?? material.itemId}</div>
                <div className="text-[0.625rem] text-muted-foreground">
                  {material.direction}
                </div>
              </div>
              <div className="tabular-nums">
                {formatNumber(material.ratePerMinute)}
                <span className="ml-1 text-[0.625rem] text-muted-foreground">
                  /min
                </span>
              </div>
            </div>
          );
        })}
        {consumed.maximumMw > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
            <span className="text-muted-foreground">Power consumption</span>
            <span className="tabular-nums">{formatPowerRange(consumed)}</span>
          </div>
        )}
        {produced.maximumMw > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
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

function InspectorContent({
  editor,
  node,
}: Readonly<{ editor: CanvasEditor; node: CanvasNode }>) {
  const [scope, setScope] = useState<InspectorScope>("all");
  const configuration = node.configuration;
  const instances =
    configuration.kind === "process" ? configuration.instances : [];
  const safeScope = scope === "all" || scope < instances.length ? scope : "all";
  const buildable = findBuildable(configuration.buildableId);

  useEffect(() => setScope("all"), [configuration.id]);

  return (
    <>
      <div className="mx-auto mt-1.5 h-1 w-9 shrink-0 rounded-full bg-border lg:hidden" />
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
        <NodeMetrics configuration={configuration} scope={safeScope} />
      </div>
      <footer className="flex justify-end gap-1 border-t border-border p-2">
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
  const node = selectedId
    ? state.document.nodes.find(
        (candidate) => candidate.configuration.id === selectedId,
      )
    : undefined;
  if (!node) return null;

  return (
    <aside
      aria-label={`Node details: ${node.label}`}
      className="pointer-events-auto absolute right-3 bottom-16 left-3 flex max-h-[min(68dvh,38rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[22rem]"
    >
      <InspectorContent editor={editor} node={node} />
    </aside>
  );
}
