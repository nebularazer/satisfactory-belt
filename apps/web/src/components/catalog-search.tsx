/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The virtualized combobox popup uses a grid with independent row actions; absolute positioning requires div/span rows and cells. */
/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Search owns local UI state; only the bounded virtual window renders rows. */
import {
  createSearchIndex,
  searchCatalog,
  recipeSearchSummary,
} from "@satisfactory-belt/game-data/search";
import type { SearchEntry, SearchOptions, SearchScope } from "@satisfactory-belt/game-data/search";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeftIcon, SearchIcon, XIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { CatalogIcon, CatalogSearchDetails } from "@/components/catalog-search-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GameAssets } from "@/lib/game-assets";

type Frame = {
  query: string;
  category: NonNullable<SearchOptions["category"]>;
  scope?: SearchScope;
  offset: number;
  activeId?: string;
};
const emptyFrame = (): Frame => ({ query: "", category: "all", offset: 0 });
const label = (entry: SearchEntry) => entry.name;
const value = (entry: SearchEntry) => entry.id;

export function CatalogSearch({
  assets,
  open,
  onOpenChange,
  finalFocus,
  onAdd,
  allowedEntryIds,
}: {
  assets: GameAssets;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: () => HTMLElement | null;
  onAdd?: (entry: SearchEntry, scope?: SearchScope) => void;
  /** Eligibility from the material-link resolver; immutable snapshot of SearchEntry IDs. */
  allowedEntryIds?: ReadonlySet<string>;
}) {
  const fullIndex = useMemo(() => createSearchIndex(assets.catalog), [assets.catalog]);
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
    setSelected(entry);
  }
  function showAlternative(entry: SearchEntry) {
    if (allowedEntryIds && !allowedEntryIds.has(entry.id)) return;
    setPlacementError(null);
    if (selected?.kind === "machine" || selected?.kind === "extractor") {
      setParent(frame);
      setFrame({ ...emptyFrame(), scope: { kind: selected.kind, id: selected.entityId } });
    }
    setSelected(entry);
  }
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
  function back() {
    setSelected(null);
    if (parent) {
      setFrame(parent);
      setParent(null);
    }
    restoreInputFocus.current ||= !narrow;
  }
  function changeOpen(next: boolean) {
    setPlacementError(null);
    if (!next) {
      setSelected(null);
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
      selected &&
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
  const compact = narrow && viewport.height < 500;
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
            ? "flex shrink-0 items-center gap-2 px-4 pt-4 pb-3 outline-none sm:pr-16"
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
        />
      )}
      <div
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
          index={index}
          assets={assets}
          frame={frame}
          onFrameChange={setFrame}
          onChoose={choose}
          onDetails={showDetails}
          canAdd={Boolean(onAdd)}
          restricted={allowedEntryIds !== undefined}
          inputRef={input}
          restoreInputFocus={restoreInputFocus}
          compact={compact}
          visible={!selected}
        />
      </div>
    </>
  );
  return narrow ? (
    <Drawer open={open} onOpenChange={changeOpen} showSwipeHandle>
      <DrawerContent
        swipeFromHandleOnly
        onKeyDownCapture={backShortcut}
        onKeyDown={keyDown}
        initialFocus={() => (selected ? heading.current : input.current)}
        finalFocus={finalFocus}
        className="h-[min(42rem,65dvh)]"
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
        <DialogClose
          render={<Button variant="ghost" size="icon" className="absolute top-4 right-4 size-9" />}
          aria-label="Close catalog"
        >
          <XIcon />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function SearchResults({
  index,
  assets,
  frame,
  onFrameChange,
  onChoose,
  onDetails,
  canAdd,
  restricted,
  inputRef,
  restoreInputFocus,
  compact,
  visible,
}: {
  index: readonly SearchEntry[];
  assets: GameAssets;
  frame: Frame;
  onFrameChange: (frame: Frame) => void;
  onChoose: (entry: SearchEntry, offset: number) => void;
  onDetails: (entry: SearchEntry, offset: number) => void;
  canAdd: boolean;
  restricted: boolean;
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
    () => searchCatalog(index, frame.query, { category: frame.category, scope: frame.scope }),
    [index, frame.query, frame.category, frame.scope],
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
    estimateSize: () => 72,
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
  function update(change: Partial<Frame>) {
    setActive(0);
    onFrameChange({ ...frame, ...change, offset: 0, activeId: undefined });
    virtualizer.scrollToOffset(0);
  }
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
      <div className="shrink-0 space-y-3 px-4 pb-3">
        <div
          className={frame.scope ? "flex items-center gap-2" : "flex items-center gap-2 sm:pr-11"}
        >
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
                if (entry) onDetails(entry, scroll.current?.scrollTop ?? 0);
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
        {!frame.scope && (
          <fieldset aria-label="Result category" className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["recipes", "Recipes"],
                ["buildings", "Buildings"],
              ] as const
            ).map(([category, name]) => (
              <Button
                key={category}
                variant={frame.category === category ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                aria-pressed={frame.category === category}
                onClick={() => update({ category })}
              >
                {name}
              </Button>
            ))}
          </fieldset>
        )}
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
          "aria-colcount": 2,
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
                className="gap-2 px-2 pr-1 [&>[data-slot=combobox-item-indicator]]:hidden"
              >
                <span
                  role="gridcell"
                  className="flex min-w-0 flex-1 items-center gap-3"
                  aria-disabled={!canAdd && entry.kind !== "machine" && entry.kind !== "extractor"}
                >
                  <CatalogIcon assets={assets} iconId={entry.iconId} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="line-clamp-2 whitespace-normal font-medium leading-5">
                        {entry.name}
                      </span>
                      {entry.alternate && <Badge variant="secondary">Alternate</Badge>}
                      {entry.events.length > 0 && <Badge variant="outline">Event</Badge>}
                    </span>
                    <span className="mt-0.5 flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span
                        className="min-w-0 truncate"
                        title={entry.machineSummary ?? entry.subtitle}
                      >
                        {entry.machineSummary ?? entry.subtitle}
                      </span>
                      {entry.productionRate && (
                        <span className="shrink-0 tabular-nums">· {entry.productionRate}</span>
                      )}
                    </span>
                  </span>
                  {canAdd && (
                    <PlusIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  )}
                </span>
                <span role="gridcell" className="shrink-0 border-l border-border pl-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 min-w-11 shrink-0 gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-transparent dark:hover:bg-transparent"
                    aria-label={`Details for ${entry.name}`}
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
                      onDetails(entry, scroll.current?.scrollTop ?? 0);
                    }}
                  >
                    Details
                    <ChevronRightIcon aria-hidden="true" className="size-3.5" />
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
            {restricted
              ? "Try another name or reset filters. Only choices that support this connection are available."
              : "Try another name or reset the filters."}
          </p>
          <Button variant="outline" onClick={() => update({ query: "", category: "all" })}>
            Reset search
          </Button>
        </div>
      )}
      <p
        className={
          compact ? "sr-only" : "shrink-0 border-t px-4 py-3 text-xs text-muted-foreground"
        }
      >
        Use the details button to inspect a result
        <span className="hidden sm:inline"> · ↑ ↓ Navigate · Alt+Enter Details · Esc Close</span>
      </p>
    </Combobox>
  );
}
