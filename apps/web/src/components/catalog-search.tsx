/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The virtualized combobox popup uses a grid with independent row actions; absolute positioning requires div/span rows and cells. */
/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Search owns local UI state; only the bounded virtual window renders rows. */
import { createSearchIndex, searchCatalog } from "@satisfactory-belt/game-data/search";
import type { SearchEntry, SearchOptions, SearchScope } from "@satisfactory-belt/game-data/search";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeftIcon, SearchIcon, XIcon, InfoIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { CatalogIcon, CatalogSearchDetails } from "@/components/catalog-search-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GameAssets } from "@/lib/game-assets";

type Frame = {
  query: string;
  category: NonNullable<SearchOptions["category"]>;
  scope?: SearchScope;
  offset: number;
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
}: {
  assets: GameAssets;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: () => HTMLElement | null;
  onAdd?: (entry: SearchEntry, scope?: SearchScope) => void;
}) {
  const index = useMemo(() => createSearchIndex(assets.catalog), [assets.catalog]);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    bottom: 0,
  }));
  const [frame, setFrame] = useState<Frame>(emptyFrame);
  const [parent, setParent] = useState<Frame | null>(null);
  const [detailHistory, setDetailHistory] = useState<SearchEntry[]>([]);
  const [selected, setSelected] = useState<SearchEntry | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const restoreInputFocus = useRef(false);
  const heading = useRef<HTMLDivElement>(null);
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
        bottom: Math.max(
          0,
          window.innerHeight - (visual?.height ?? window.innerHeight) - (visual?.offsetTop ?? 0),
        ),
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
    const saved = { ...frame, offset };
    if (entry.kind === "machine" || entry.kind === "extractor") {
      setParent(saved);
      setFrame({ ...emptyFrame(), scope: { kind: entry.kind, id: entry.entityId } });
      restoreInputFocus.current = !narrow || document.activeElement === input.current;
    } else if (onAdd) {
      onAdd(entry, frame.scope);
      onOpenChange(false);
    }
  }
  function showDetails(entry: SearchEntry, offset: number) {
    setFrame((current) => ({ ...current, offset }));
    setDetailHistory([]);
    setSelected(entry);
  }
  function showAlternative(entry: SearchEntry) {
    if (selected) setDetailHistory((previous) => [...previous, selected]);
    setSelected(entry);
  }
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
  function back() {
    if (detailHistory.length) {
      setSelected(detailHistory[detailHistory.length - 1]!);
      setDetailHistory((previous) => previous.slice(0, -1));
      return;
    }
    if (selected) setSelected(null);
    else if (parent) {
      setFrame(parent);
      setParent(null);
    }
    restoreInputFocus.current = true;
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    // Portalled events also bubble through the workspace's document shortcuts.
    event.stopPropagation();
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onOpenChange(false);
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
    ? "Details"
    : scopeName
      ? `${scopeName} · ${frame.scope?.kind === "machine" ? "Recipes" : "Resources"}`
      : "Search catalog";
  const content = (
    <>
      <div
        ref={heading}
        tabIndex={-1}
        className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-3 pr-12 outline-none"
      >
        {(selected || parent) && (
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back to results">
            <ArrowLeftIcon />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          {narrow ? <DrawerTitle>{title}</DrawerTitle> : <DialogTitle>{title}</DialogTitle>}
          {narrow ? (
            <DrawerDescription className={compact ? "sr-only" : undefined}>
              Buildings, recipes, and alternatives
            </DrawerDescription>
          ) : (
            <DialogDescription>Buildings, recipes, and alternatives</DialogDescription>
          )}
        </div>
        {narrow && (
          <DrawerClose
            render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}
            aria-label="Close search"
          >
            <XIcon />
          </DrawerClose>
        )}
      </div>
      {selected ? (
        <CatalogSearchDetails
          key={selected.id}
          entry={selected}
          index={index}
          onDetails={showAlternative}
          assets={assets}
          machineId={frame.scope?.kind === "machine" ? frame.scope.id : undefined}
        />
      ) : (
        <SearchResults
          key={frame.scope?.id ?? "catalog"}
          index={index}
          assets={assets}
          frame={frame}
          onFrameChange={setFrame}
          onChoose={choose}
          onDetails={showDetails}
          canAdd={Boolean(onAdd)}
          inputRef={input}
          restoreInputFocus={restoreInputFocus}
          compact={compact}
        />
      )}
    </>
  );
  return narrow ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onKeyDown={keyDown}
        initialFocus={() => heading.current}
        finalFocus={finalFocus}
        // The sheet already fits the visual viewport. Keep its body non-scrollable so
        // Drawer does not add keyboard reveal padding around the fixed search field.
        className="[--bleed:0px] transition-[transform,opacity,filter] [&>[data-slot=drawer-content]]:overflow-clip"

        style={{
          height: Math.min(viewport.height - 12, 760),
          maxHeight: viewport.height - 12,
          bottom: viewport.bottom,
          paddingBottom: viewport.bottom > 0 ? 0 : "env(safe-area-inset-bottom)",
        }}
      >
        {content}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
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
  assets,
  frame,
  onFrameChange,
  onChoose,
  onDetails,
  canAdd,
  inputRef,
  restoreInputFocus,
  compact,
}: {
  index: readonly SearchEntry[];
  assets: GameAssets;
  frame: Frame;
  onFrameChange: (frame: Frame) => void;
  onChoose: (entry: SearchEntry, offset: number) => void;
  onDetails: (entry: SearchEntry, offset: number) => void;
  canAdd: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  restoreInputFocus: React.RefObject<boolean>;
  compact: boolean;
}) {
  useEffect(() => {
    if (!restoreInputFocus.current) return undefined;
    const focusFrame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      restoreInputFocus.current = false;
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [inputRef, restoreInputFocus]);
  const results = useMemo(() => searchCatalog(index, frame.query, frame), [index, frame]);
  const scroll = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const getItemKey = useCallback((i: number) => results[i]!.id, [results]);
  // oxlint-disable-next-line react/incompatible-library -- React Compiler is not enabled; virtualizer stays local to this component.
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 64,
    overscan: 5,
    getItemKey,
    initialOffset: frame.offset,
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      return active >= 0 && active < results.length
        ? [...new Set([...visible, active])].toSorted((a, b) => a - b)
        : visible;
    },
  });
  function update(change: Partial<Frame>) {
    setActive(-1);
    onFrameChange({ ...frame, ...change, offset: 0 });
    virtualizer.scrollToOffset(0);
  }
  return (
    <Combobox<SearchEntry>
      inline
      open
      virtualized
      autoHighlight
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
        setActive(details.index);
        if (details.index >= 0 && details.reason === "keyboard")
          virtualizer.scrollToIndex(details.index, { align: "auto" });
      }}
    >
      <div className="shrink-0 space-y-3 px-4 pb-3">
        <div className="flex items-center gap-2">
          <ComboboxInput
            ref={inputRef}
            showTrigger={false}
            className="h-9 min-w-0 flex-1"
            showClear={false}
            aria-haspopup="grid"
            onKeyDown={(event) => {
              if (event.altKey && event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                const entry = results[active] ?? results[0];
                if (entry) onDetails(entry, scroll.current?.scrollTop ?? 0);
              } else if (event.key === "Enter" && active < 0 && !event.nativeEvent.isComposing) {
                event.preventDefault();
                const entry = results[0];
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
        className="min-h-0 flex-1"
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
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{entry.name}</span>
                      {entry.alternate && <Badge variant="secondary">Alternate</Badge>}
                      {entry.events.length > 0 && <Badge variant="outline">Event</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.subtitle}
                    </span>
                  </span>
                  <PlusIcon
                    aria-hidden="true"
                    className={
                      canAdd || entry.kind === "machine" || entry.kind === "extractor"
                        ? "size-3.5 shrink-0 text-muted-foreground"
                        : "size-3.5 shrink-0 text-muted-foreground/30"
                    }
                  />
                </span>
                <span role="gridcell">
                  <Button
                    variant="ghost"
                    size="icon-sm"
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
                    <InfoIcon />
                  </Button>
                </span>
              </ComboboxItem>
            );
          })}
        </div>
      </ScrollArea>
      {results.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-6 text-center">
          <p>No matches found</p>
          <p className="text-sm text-muted-foreground">Try another name or reset the filters.</p>
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
