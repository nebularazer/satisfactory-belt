/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The virtualized combobox popup uses a grid with independent row actions; absolute positioning requires div/span rows and cells. */
/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Search owns local UI state; only the bounded virtual window renders rows. */
import {
  createSearchIndex,
  searchCatalog,
  recipeSearchSummary,
} from "@satisfactory-belt/game-data/search";
import type {
  SearchDirection,
  SearchEntry,
  SearchField,
  SearchMaterial,
  SearchScope,
} from "@satisfactory-belt/game-data/search";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeftIcon, CircleCheckIcon, InfoIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { CatalogIcon, CatalogSearchDetails } from "@/components/catalog-search-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GameAssets } from "@/lib/game-assets";

type Frame = {
  query: string;
  fields: readonly SearchField[];
  scope?: SearchScope;
  offset: number;
  activeId?: string;
};
const allFields: readonly SearchField[] = ["name", "input", "output"];
const emptyFrame = (): Frame => ({ query: "", fields: allFields, offset: 0 });
export type CatalogConnectionContext = Readonly<{
  direction: SearchDirection;
  itemIds: readonly string[];
}>;
const label = (entry: SearchEntry) => entry.name;
const value = (entry: SearchEntry) => entry.id;

export function CatalogSearch({
  assets,
  open,
  onOpenChange,
  finalFocus,
  onAdd,
  allowedEntryIds,
  connectionContext,
  searchIndex,
}: {
  assets: GameAssets;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: () => HTMLElement | null;
  onAdd?: (entry: SearchEntry, scope?: SearchScope) => void;
  /** Eligibility from the material-link resolver; immutable snapshot of SearchEntry IDs. */
  allowedEntryIds?: ReadonlySet<string>;
  connectionContext?: CatalogConnectionContext;
  searchIndex?: readonly SearchEntry[];
}) {
  const fullIndex = useMemo(
    () => searchIndex ?? createSearchIndex(assets.catalog),
    [assets.catalog, searchIndex],
  );
  const index = useMemo(
    () =>
      allowedEntryIds ? fullIndex.filter((entry) => allowedEntryIds.has(entry.id)) : fullIndex,
    [fullIndex, allowedEntryIds],
  );
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  const [frame, setFrame] = useState<Frame>(emptyFrame);
  const [searchSession, setSearchSession] = useState(0);
  const [parent, setParent] = useState<Frame | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [comparisonBaseline, setComparisonBaseline] = useState<SearchEntry | null>(null);
  const [detailEntry, setSelected] = useState<SearchEntry | null>(null);
  const selected =
    detailEntry && index.some((entry) => entry.id === detailEntry.id) ? detailEntry : null;
  const input = useRef<HTMLInputElement>(null);
  const restoreInputFocus = useRef(false);
  const heading = useRef<HTMLDivElement>(null);
  const detailPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const visual = window.visualViewport;
    const resize = () =>
      setViewport({
        height: visual?.height ?? window.innerHeight,
      });
    resize();
    visual?.addEventListener("resize", resize);
    visual?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      visual?.removeEventListener("resize", resize);
      visual?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  function choose(entry: SearchEntry, offset: number) {
    const saved = { ...frame, offset, activeId: entry.id };
    if (entry.kind === "machine" || entry.kind === "extractor") {
      setParent(saved);
      setFrame({ ...emptyFrame(), scope: { kind: entry.kind, id: entry.entityId } });
      restoreInputFocus.current = !narrow || document.activeElement === input.current;
    } else if (onAdd) {
      place(entry);
    }
  }
  function place(entry: SearchEntry) {
    if (!onAdd || (allowedEntryIds && !allowedEntryIds.has(entry.id))) return;
    try {
      onAdd(entry, frame.scope);
      setPlacementError(null);
      changeOpen(false);
      // A successful insertion starts a fresh search, including any saved building scope.
      setFrame(emptyFrame());
      setParent(null);
      setSearchSession((current) => current + 1);
    } catch (error) {
      setPlacementError(error instanceof Error ? error.message : "Unable to place this node.");
    }
  }
  function showDetails(entry: SearchEntry, offset: number) {
    restoreInputFocus.current = document.activeElement === input.current;
    setFrame((current) => ({ ...current, offset, activeId: entry.id }));
    setComparisonBaseline(entry.kind === "recipe" ? entry : null);
    setSelected(entry);
  }
  function showAlternative(entry: SearchEntry) {
    if (allowedEntryIds && !allowedEntryIds.has(entry.id)) return;
    setPlacementError(null);
    if (selected?.kind === "machine" || selected?.kind === "extractor") {
      setParent(frame);
      setFrame({ ...emptyFrame(), scope: { kind: selected.kind, id: selected.entityId } });
    }
    if (!comparisonBaseline && entry.kind === "recipe") setComparisonBaseline(entry);
    setSelected(entry);
  }
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
  function back() {
    setPlacementError(null);
    if (selected) {
      setSelected(null);
      setComparisonBaseline(null);
    } else if (parent) {
      setFrame(parent);
      setParent(null);
    }
    restoreInputFocus.current ||= !narrow;
  }
  function changeOpen(next: boolean) {
    setPlacementError(null);
    if (!next) {
      setSelected(null);
      setComparisonBaseline(null);
      if (parent) {
        setFrame(parent);
        setParent(null);
      }
      restoreInputFocus.current = false;
    }
    onOpenChange(next);
  }
  function backShortcut(event: KeyboardEvent<HTMLElement>) {
    if (
      (selected || parent) &&
      !event.nativeEvent.isComposing &&
      ((event.altKey && ["ArrowLeft", "Backspace"].includes(event.key)) ||
        event.key === "BrowserBack")
    ) {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    // Portalled events also bubble through the workspace's document shortcuts.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (
      selected &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      const buttons = Array.from(
        detailPanel.current?.querySelectorAll<HTMLButtonElement>(
          "[data-catalog-related]:not(:disabled):not([aria-disabled='true'])",
        ) ?? [],
      );
      if (buttons.length) {
        event.preventDefault();
        const current = buttons.findIndex((button) =>
          button.closest("li")?.contains(document.activeElement),
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : current < 0
                ? event.key === "ArrowDown"
                  ? 0
                  : buttons.length - 1
                : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
        buttons[next]?.focus({ preventScroll: true });
        buttons[next]?.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      changeOpen(false);
    }
  }
  const compact = narrow && viewport.height < 600;
  const scopeName =
    frame.scope?.kind === "machine"
      ? assets.catalog.machines[frame.scope.id]?.name
      : frame.scope
        ? assets.catalog.extractors[frame.scope.id]?.name
        : null;
  const title = selected
    ? selected.name
    : scopeName
      ? `${scopeName} · ${frame.scope?.kind === "machine" ? "Recipes" : "Resources"}`
      : "Search catalog";
  const selectedMachineId =
    selected?.kind === "recipe"
      ? frame.scope?.kind === "machine" && selected.machineIds.includes(frame.scope.id)
        ? frame.scope.id
        : selected.machineIds[0]
      : undefined;
  const subtitle = selected
    ? selected.kind === "recipe"
      ? recipeSearchSummary(assets.catalog, selected.entityId, selectedMachineId)
      : selected.subtitle
    : "Buildings, recipes, and alternatives";
  const content = (
    <>
      <div
        ref={heading}
        tabIndex={-1}
        className={
          selected || scopeName
            ? "flex shrink-0 items-center gap-2 px-4 pt-4 pb-3 outline-none"
            : "sr-only"
        }
      >
        {(selected || parent) && (
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back to results">
            <ArrowLeftIcon />
          </Button>
        )}
        {selected && <CatalogIcon iconId={selected.iconId} assets={assets} />}
        <div className="min-w-0 flex-1 space-y-0">
          <div className="flex min-h-5 flex-wrap items-center gap-2">
            {narrow ? <DrawerTitle>{title}</DrawerTitle> : <DialogTitle>{title}</DialogTitle>}
            {selected?.alternate && <Badge variant="secondary">Alternate</Badge>}
            {selected && selected.events.length > 0 && <Badge variant="outline">Event</Badge>}
          </div>
          {narrow ? (
            <DrawerDescription>{subtitle}</DrawerDescription>
          ) : (
            <DialogDescription>{subtitle}</DialogDescription>
          )}
        </div>
      </div>
      {placementError && (
        <p role="alert" className="shrink-0 px-4 pb-3 text-sm text-destructive">
          {placementError}
        </p>
      )}
      {selected && (
        <CatalogSearchDetails
          key={selected.id}
          entry={selected}
          index={fullIndex}
          allowedEntryIds={allowedEntryIds}
          onPlace={onAdd ? place : undefined}
          onDetails={showAlternative}
          panelRef={detailPanel}
          assets={assets}
          machineId={frame.scope?.kind === "machine" ? frame.scope.id : undefined}
          comparisonBaseline={comparisonBaseline ?? undefined}
        />
      )}
      <div
        hidden={Boolean(selected)}
        className={
          selected
            ? "hidden"
            : frame.scope
              ? "flex min-h-0 flex-1 flex-col"
              : "flex min-h-0 flex-1 flex-col pt-4"
        }
      >
        <SearchResults
          key={`${searchSession}:${frame.scope?.id ?? "catalog"}`}
          index={fullIndex}
          allowedEntryIds={allowedEntryIds}
          assets={assets}
          frame={frame}
          onFrameChange={setFrame}
          onChoose={choose}
          onDetails={showDetails}
          canAdd={Boolean(onAdd)}
          restricted={allowedEntryIds !== undefined}
          connectionContext={connectionContext}
          inputRef={input}
          restoreInputFocus={restoreInputFocus}
          compact={compact}
          visible={!selected}
        />
      </div>
    </>
  );
  if (narrow && !open) return null;
  return narrow ? (
    <Drawer open={open} onOpenChange={changeOpen} showSwipeHandle>
      <DrawerContent
        swipeFromHandleOnly
        onKeyDownCapture={backShortcut}
        onKeyDown={keyDown}
        initialFocus={() => (selected ? heading.current : input.current)}
        finalFocus={finalFocus}
        className={compact ? "h-[calc(100dvh-6rem)]" : "h-[60dvh]"}
      >
        {content}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        showCloseButton={false}
        onKeyDownCapture={backShortcut}
        onKeyDown={keyDown}
        initialFocus={() => (selected ? heading.current : input.current)}
        finalFocus={finalFocus}
        className="flex h-[min(42rem,calc(100dvh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-160"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

function SearchResults({
  index,
  allowedEntryIds,
  assets,
  frame,
  onFrameChange,
  onChoose,
  onDetails,
  canAdd,
  restricted,
  connectionContext,
  inputRef,
  restoreInputFocus,
  compact,
  visible,
}: {
  index: readonly SearchEntry[];
  allowedEntryIds?: ReadonlySet<string>;
  assets: GameAssets;
  frame: Frame;
  onFrameChange: (frame: Frame) => void;
  onChoose: (entry: SearchEntry, offset: number) => void;
  onDetails: (entry: SearchEntry, offset: number) => void;
  canAdd: boolean;
  restricted: boolean;
  connectionContext?: CatalogConnectionContext;
  inputRef: React.RefObject<HTMLInputElement | null>;
  restoreInputFocus: React.RefObject<boolean>;
  compact: boolean;
  visible: boolean;
}) {
  useEffect(() => {
    if (!visible || !restoreInputFocus.current) return undefined;
    // Let the dialog restore focus after the details controls leave the DOM first.
    let focusFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
        if (scroll.current) scroll.current.scrollTop = frame.offset;
        restoreInputFocus.current = false;
      });
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [inputRef, restoreInputFocus, frame.offset, visible]);
  const results = useMemo(
    () =>
      searchCatalog(index, frame.query, {
        fields: frame.fields,
        scope: frame.scope,
        allowedEntryIds,
      }),
    [index, frame.query, frame.fields, frame.scope, allowedEntryIds],
  );
  const scroll = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() =>
    results.findIndex((entry) => entry.id === frame.activeId),
  );
  const resultId = useId();
  const getItemKey = useCallback((i: number) => results[i]!.id, [results]);
  // oxlint-disable-next-line react/incompatible-library -- React Compiler is not enabled; virtualizer stays local to this component.
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 48,
    overscan: 5,
    getItemKey,
    initialOffset: frame.offset,
    rangeExtractor: (range) => {
      const visibleRows = defaultRangeExtractor(range);
      return active >= 0 && active < results.length
        ? [...new Set([...visibleRows, active])].toSorted((a, b) => a - b)
        : visibleRows;
    },
  });
  useLayoutEffect(() => {
    if (visible) virtualizer.scrollToOffset(frame.offset);
  }, [frame.offset, virtualizer, visible]);
  function inspect(entry: SearchEntry) {
    setActive(results.indexOf(entry));
    onDetails(entry, scroll.current?.scrollTop ?? 0);
  }
  function update(change: Partial<Frame>) {
    setActive(0);
    onFrameChange({ ...frame, ...change, offset: 0, activeId: undefined });
    virtualizer.scrollToOffset(0);
  }
  const activeEntry = results[active] ?? results[0];
  const chooseAction = activeEntry?.kind === "machine" || activeEntry?.kind === "extractor";
  const contextLabel = connectionContext
    ? `${connectionContext.direction === "consumes" ? "Consumes" : "Produces"} ${
        connectionContext.itemIds
          .map((id) => assets.catalog.items[id]?.name)
          .filter(Boolean)
          .join(" + ") || "compatible items"
      }`
    : restricted
      ? "Compatible choices"
      : null;
  return (
    <Combobox<SearchEntry>
      inline
      open
      virtualized
      items={results}
      filteredItems={results}
      filter={null}
      value={null}
      inputValue={frame.query}
      itemToStringLabel={label}
      itemToStringValue={value}
      onInputValueChange={(query, details) => {
        if (details.reason === "input-change" || details.reason === "input-clear")
          update({ query });
      }}
      onValueChange={(entry) => {
        if (entry) onChoose(entry, scroll.current?.scrollTop ?? 0);
      }}
      onItemHighlighted={(_entry, details) => {
        if (details.reason === "pointer" && details.index >= 0) setActive(details.index);
      }}
    >
      <div className="shrink-0 space-y-2 px-4 pb-3">
        {contextLabel && (
          <p className="truncate text-sm font-medium" title={contextLabel}>
            {contextLabel}
          </p>
        )}
        <div className="flex items-center gap-2">
          <ComboboxInput
            ref={inputRef}
            type="search"
            autoComplete="off"
            inputMode="search"
            enterKeyHint="search"
            showTrigger={false}
            className="h-9 min-w-0 flex-1 [&_input::-webkit-search-cancel-button]:appearance-none"
            showClear={false}
            aria-haspopup="grid"
            aria-activedescendant={
              active >= 0 && results[active] ? `${resultId}-${active}` : undefined
            }
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              // Custom virtualized navigation owns these keys; prevent the combobox from
              // also navigating or selecting its last pointer-highlighted item.
              if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key))
                event.preventBaseUIHandler();
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                event.stopPropagation();
                const next = !results.length
                  ? -1
                  : active < 0
                    ? event.key === "ArrowDown"
                      ? 0
                      : results.length - 1
                    : (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) %
                      results.length;
                setActive(next);
                if (next >= 0) virtualizer.scrollToIndex(next, { align: "auto" });
              } else if (event.altKey && event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                const entry = results[active] ?? results[0];
                if (entry) inspect(entry);
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                const entry = results[active] ?? results[0];
                if (entry) onChoose(entry, scroll.current?.scrollTop ?? 0);
              }
            }}
            aria-label="Search buildings and recipes"
            placeholder="Search buildings and recipes…"
          >
            <InputGroupAddon align="inline-start">
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            {frame.query.length > 0 && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => {
                    update({ query: "" });
                    inputRef.current?.focus();
                  }}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </ComboboxInput>
        </div>
        <ToggleGroup
          multiple
          value={frame.fields}
          onValueChange={(fields) =>
            update({ fields: allFields.filter((field) => fields.includes(field)) })
          }
          aria-label="Search fields"
          variant="outline"
          size="sm"
          className="w-full"
        >
          {(
            [
              ["name", "Recipe name"],
              ["input", "Input"],
              ["output", "Output"],
            ] as const
          ).map(([field, name]) => (
            <ToggleGroupItem key={field} value={field} className="flex-1">
              <CircleCheckIcon
                aria-hidden="true"
                className="size-3.5 fill-transparent stroke-muted-foreground group-aria-pressed/toggle:fill-foreground group-aria-pressed/toggle:stroke-background group-aria-pressed/toggle:[&_path]:opacity-100 [&_path]:opacity-0"
              />
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <output
        aria-live="polite"
        className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground"
      >
        {results.length} {results.length === 1 ? "result" : "results"}
      </output>
      <ScrollArea
        className={results.length ? "min-h-0 flex-1" : "hidden"}
        viewportProps={{
          ref: scroll,
          role: "grid",
          "aria-rowcount": results.length,
          "aria-colcount": 4,
          tabIndex: -1,
          render: <ComboboxList aria-label="Catalog results" className="max-h-none p-0" />,
          className: "overscroll-contain",
        }}
      >
        <div
          role="presentation"
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const entry = results[row.index]!;
            return (
              <ComboboxItem
                key={entry.id}
                render={<div id={`${resultId}-${row.index}`} />}
                data-highlighted={active === row.index ? "" : undefined}
                value={entry}
                index={row.index}
                role="row"
                aria-rowindex={row.index + 1}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 8,
                  width: "calc(100% - 20px)",
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
                className="grid grid-cols-[4.75rem_minmax(0,1fr)_4.75rem_1.75rem] gap-1 px-2 [&>[data-slot=combobox-item-indicator]]:hidden"
              >
                <span
                  role="gridcell"
                  aria-disabled={!canAdd && entry.kind !== "machine" && entry.kind !== "extractor"}
                >
                  <MaterialSlots assets={assets} materials={entry.inputs} side="input" />
                </span>
                <span
                  role="gridcell"
                  className="flex min-w-0 items-center justify-center gap-2 text-sm font-medium"
                >
                  <span className="min-w-0 truncate" title={entry.name}>
                    {entry.name}
                  </span>
                  {entry.alternate && <Badge variant="secondary">Alternate</Badge>}
                  {entry.events.length > 0 && <Badge variant="outline">Event</Badge>}
                </span>
                <span
                  role="gridcell"
                  aria-disabled={!canAdd && entry.kind !== "machine" && entry.kind !== "extractor"}
                >
                  <MaterialSlots assets={assets} materials={entry.outputs} side="output" />
                </span>
                <span role="gridcell">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-11 text-muted-foreground"
                    aria-label={`Details for ${entry.name}`}
                    title="Details"
                    tabIndex={active === row.index ? 0 : -1}
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") return;
                      event.stopPropagation();
                      if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        inputRef.current?.focus();
                      }
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      inspect(entry);
                    }}
                  >
                    <InfoIcon aria-hidden="true" className="size-4" />
                  </Button>
                </span>
              </ComboboxItem>
            );
          })}
        </div>
      </ScrollArea>
      {results.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-6 text-center">
          <p>{restricted ? "No compatible choices found" : "No matches found"}</p>
          <p className="text-sm text-muted-foreground">
            {!frame.fields.length
              ? "Enable Recipe name, Input, or Output to search."
              : restricted
                ? "Try another name or reset filters. Only choices that support this connection are available."
                : "Try another name or reset the filters."}
          </p>
          <Button variant="outline" onClick={() => update({ query: "", fields: allFields })}>
            Reset search
          </Button>
        </div>
      )}
      <p
        className={
          compact ? "sr-only" : "shrink-0 border-t px-4 py-3 text-xs text-muted-foreground"
        }
      >
        {canAdd
          ? chooseAction
            ? "Choose a recipe or resource"
            : "Select a result to place it"
          : "Use Details to inspect a result"}
        <span className="hidden sm:inline">
          {" "}
          · ↑ ↓ Navigate
          {canAdd || chooseAction ? ` · Enter ${chooseAction ? "Choose" : "Place"}` : ""} ·
          Alt+Enter Details · Alt+← Back · Esc Close
        </span>
      </p>
    </Combobox>
  );
}

/** Reserve four slots per side so flows align across every result. */
function MaterialSlots({
  assets,
  materials,
  side,
}: {
  assets: GameAssets;
  materials: readonly SearchMaterial[];
  side: "input" | "output";
}) {
  return (
    <span
      role="group"
      aria-label={side === "input" ? "Inputs" : "Outputs"}
      className="grid shrink-0 grid-cols-4 gap-1"
    >
      {Array.from({ length: 4 }, (_, slot) => {
        const material = materials[side === "input" ? slot : slot - (4 - materials.length)];
        return material ? (
          <span
            key={slot}
            role="img"
            aria-label={material.name}
            title={material.name}
            className="size-4"
          >
            <CatalogIcon
              assets={assets}
              iconId={assets.catalog.items[material.itemId]!.iconId}
              size={16}
            />
          </span>
        ) : (
          <span key={slot} aria-hidden="true" className="size-4" />
        );
      })}
    </span>
  );
}
