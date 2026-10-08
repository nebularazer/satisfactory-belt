# Catalog search integration

`createSearchIndex(catalog)` prepares names, initialisms, icons, and input/output
material names and rates once per catalog. The workspace shares this prepared index
with the search UI. `searchCatalog(index, query, options)` applies eligibility and
building scope before ranking. Exact names precede name abbreviations, prefixes,
partial names, and material matches. One-edit typo matching (including adjacent
letter swaps) runs only when no direct match exists, retaining the same name-first
ranking. Resource choices also match their extractor name and tier.

Recipe name, Input, and Output are independent toggles, all enabled by default.
`SearchOptions.fields` selects the searchable fields; results match any enabled
field, with all query tokens matching the same name or individual material.
An empty field selection gives no results. Input/output matching includes item
abbreviations and byproducts. Complete item names select that exact material
(separating packaged items); partial queries can match several materials.

The full-width shadcn toggles use a Lucide CircleCheck indicator: an outline circle
when inactive and a filled circle with a check when active. The icon remains mounted
at a fixed size so switching fields does not move the labels or other controls.

Each result uses one row: four input slots aligned left, the name and Alternate/Event
badge centered in the remaining space, and four output slots aligned right. Long
names truncate without moving the slots. The centered name opens Details; the
material areas and remaining row space retain the placement/choose action.
Material names appear on hover and remain accessible to assistive technology.
Machine, power, quantities, and comparisons are available in Details.

## Canvas placement

Search has three insertion contexts:

- Right-click empty canvas: unrestricted search at the clicked world position.
- Main menu: unrestricted search at the visible canvas center.
- Drag a port onto empty canvas, or select a port and then click/tap empty canvas:
  compatible search at the drop/click world position, retaining the source port.

Each insertion request starts a fresh search session so query, enabled fields, and
building scope do not leak between connection contexts. Material connection search
shows Produces/Consumes and the known source materials. Compatibility remains the
authoritative boundary, including eligible logistics and facilities. The field
toggles remain available without changing compatibility.

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
The desktop keyboard hint reflects the active result's Choose/Place action.

Back from details restores the current results, including their query, scroll, and
selection. Back from a scoped list restores its parent catalog frame. Alt+Left works
in both views. Alternative comparisons retain the first inspected recipe's output
and quantities as a labelled baseline until returning to results.

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
- Resetting query/fields cannot remove eligibility restrictions.

Main results are filtered. Details receive the full index and eligibility snapshot:
all alternatives remain visible, but incompatible alternatives and their comparison
controls are disabled, including keyboard navigation. Alternatives only navigate to
details; they have no placement action. A disabled alternative explains that it does
not support the connection.

## Rendering and validation

Results use a fixed 48px virtual row with five rows of overscan. Only the visible
window, overscan, and keyboard-active row mount. Images use lazy loading, async
decoding, fixed dimensions, and a bounded fallback through prepared sizes.
The result list stays mounted while details are visible to preserve its selection;
it remains hidden from focus and accessibility navigation. Returning restores scroll
and keyboard focus for keyboard-initiated details.

The desktop dialog dismisses on outside click or Escape without a close button.
The mobile sheet dismisses by dragging its handle down; gestures in the result body
remain available for native scrolling.

Browser checks cover desktop, 360/390px mobile, short viewports, missing images,
empty results, event recipes, alternative navigation, and repeated opening.
Desktop viewport emulation does not reproduce an Android software keyboard;
verify focusing, typing, scrolling, and dismissing the keyboard on a real device.
