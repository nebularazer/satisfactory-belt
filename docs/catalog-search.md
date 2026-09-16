# Catalog search integration

`createSearchIndex(catalog)` prepares names, related machine/output terms, initialisms,
icons, and baseline production summaries once per catalog. `searchCatalog(index,
query, options)` applies eligibility, category, and building scope before ranking.
Exact names precede prefixes, partial names, and related terms. One-edit typo
matching runs only when no direct match exists. Ingredient names do not broaden
ordinary search.

## Canvas placement

Search has three insertion contexts:

- Right-click empty canvas: unrestricted search at the clicked world position.
- Main menu: unrestricted search at the visible canvas center.
- Drag a port onto empty canvas, or select a port and then click/tap empty canvas:
  compatible search at the drop/click world position, retaining the source port.

Capture the position before opening the dialog/drawer. Center the new node on that
point and snap its top-left position when grid snapping is enabled. Logistics nodes
use their own smaller dimensions. Panning, pinching, and drops on existing nodes,
ports, links, or link handles do not open search. Cancelling search makes no edit and
preserves the connection anchor; Escape on the canvas clears it.

Machine/extractor results open recipe/resource choices. Leaf results and the details
screen's Place button call the same placement handler. Details place the currently
displayed recipe, including a selected alternative. Preserve the scoped machine when
it supports the recipe; otherwise use the first supported machine shown in details.
Defaults are one machine, 100% clock, zero sloops, and existing splitter rules.

The editor validates before inserting, selects the new node, and records one history
edit. Connection-driven placement connects the first valid port in display order.
Node and link creation are atomic, including undo/redo. A stale or incompatible
source leaves the document untouched and shows an error without closing search.
Successful placement closes search and focuses the canvas.

## Connection eligibility and alternatives

`eligibleCatalogEntries` translates search entries into configurations and asks the
editor's domain resolver whether each can connect. The resolver evaluates actual
semantic ports against material, transport, splitter filters, and downstream graph
constraints. Existing inputs need producers; existing outputs need consumers.

`CatalogSearch` and `SearchOptions` accept `allowedEntryIds?: ReadonlySet<string>`:

- Omitted: unrestricted search.
- Empty set: no compatible results, including typo fallback.
- Values are `SearchEntry.id`, not `entityId`.
- Eligible parent machines/extractors and their eligible leaf choices are included
  independently; allowing a parent does not allow every child.
- The snapshot is recomputed when the document changes while search is open.
- Resetting query/category cannot remove eligibility restrictions.

Main results are filtered. Details receive the full index and eligibility snapshot:
all alternatives remain visible, but incompatible alternatives and their comparison
controls are disabled, including keyboard navigation. Alternatives only navigate to
details; they have no placement action. A disabled alternative explains that it does
not support the connection.

## Rendering and validation

Results use a fixed 72px virtual row with five rows of overscan. Only the visible
window, overscan, and keyboard-active row mount. Images use lazy loading, async
decoding, fixed dimensions, and a bounded fallback through prepared sizes.
The result list stays mounted while details are visible to preserve its selection;
it remains hidden from focus and accessibility navigation. Returning restores scroll
and keyboard focus for keyboard-initiated details.

Browser checks cover desktop, 360/390px mobile, short viewports, missing images,
empty results, event recipes, alternative navigation, and repeated opening.
Desktop viewport emulation does not reproduce an Android software keyboard;
verify focusing, typing, scrolling, and dismissing the keyboard on a real device.
