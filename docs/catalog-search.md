# Catalog search integration

`createSearchIndex(catalog)` prepares names, related machine/output terms, initialisms,
icons, and baseline production summaries once per catalog. `searchCatalog(index,
query, options)` applies eligibility, category, and building scope before ranking.
Exact names precede prefixes, partial names, and related terms. One-edit typo
matching runs only when no direct match exists. Ingredient names do not broaden
ordinary search.

## Future material-link entry point

`CatalogSearch` and `SearchOptions` accept `allowedEntryIds?: ReadonlySet<string>`.
This is an eligibility snapshot from the future material-link resolver, not a
query or a UI filter. Search does not decide link compatibility.

- Omitted: unrestricted catalog search.
- Empty set: no eligible results, including typo fallback.
- Values use `SearchEntry.id` (for example `recipe:Recipe_IronPlate_C`), not
  `entityId`. Obtain entries from `createSearchIndex` rather than constructing IDs.
- Include eligible parent machine/extractor entries and eligible recipe/resource
  choices. Allowing a building does not automatically allow all its recipes.
- Replace the set when compatibility changes; do not mutate it in place.
- The UI applies this boundary to results, building details, and alternatives.
  Resetting the query or category cannot remove it.

The future caller will resolve the dragged port's direction, allowed materials,
transport type, and graph constraints using the material-link domain logic, then
pass the resulting IDs. For example, an existing input needs a producer and an
existing output needs a consumer. The resolver must evaluate the prospective
configuration (including recipe and machine), not merely a building name.

```tsx
<CatalogSearch
  assets={assets}
  open={open}
  onOpenChange={setOpen}
  finalFocus={() => trigger.current}
  allowedEntryIds={eligibleEntryIds}
  onAdd={(entry, scope) => handleSelection(entry, scope)}
/>
```

`onAdd(entry, scope)` is the prepared primary action. Machine/extractor selection
opens its eligible recipe/resource choices first. `scope` identifies the selected
machine or extractor. Canvas placement and the link-drag trigger remain unwired
in this feature.

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
