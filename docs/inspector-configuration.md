# Inspector configuration

Single-node or single-link selection opens the inspector. Multiple selected canvas
nodes do not. Desktop uses a top-right card; mobile uses a swipe-dismissable
bottom drawer matching catalog search. Machine groups retain the All/member tabs; settings under All show
Mixed when appropriate and write to all members. All and the count buttons stay
fixed while member numbers scroll without a scrollbar. Numeric drafts clamp on Enter or
blur, integer settings round, and empty/non-numeric drafts restore the prior value.
Stations, logistics buffers, depot uploaders and the Space Elevator are individual
buildings with no grouping tabs or count controls.
Tier/purity button groups and numeric controls share a common width. Operating-setting
labels have no icons; node footers use a gauge for clock speed. Power statistics
come last and share their light/dark colors with the canvas footer. Generated power
uses the same Lucide Zap icon as consumption in both the canvas and inspector,
with green generation and yellow consumption colors. Alien Power Matrix supply uses
a switch; mixed groups retain a Mixed label and toggling applies to the current scope.
Searchable choices keep the selected value in a trigger and open a separate, initially
empty search field. Popups align to the full control width, including icons and Add
actions. Canceling a search preserves the selection. Every selected option with an
item/building image shows it in the trigger, including cargo and recipes. Triggers use the shadcn outline
button style and lists use its compact rows with 16px item icons. Choices are sorted
alphabetically by display name, with natural numeric order; splitter rules and
From connections remain pinned above the items.

There is no enabled/standby setting. Editable input/output rate targets remain deferred.

## Supported bodies

- Manufacturing: shared recipe (including cross-building alternatives), individual
  clock and Sloops, required shards, amplification, configured material rates, and
  fixed or recipe-specific min/max/average power. Alternate recipes use a badge;
  nodes show variable power as Ø followed by its average.
- Miners and oil extraction: individual purity and clock; shared resource and
  compatible miner tier. Purity and miner tiers use inline button groups. Water
  extraction has clock but no resource or purity selector.
- Smart/programmed splitters: Marker separators label Left, Center, and Right outputs.
  Smart outputs use one direct selector with the selected item icon. Programmable
  outputs use rule lists and an always-visible picker with an integrated Add button;
  their summary shows remaining program slots out of 64. Empty lists close the output.
  Hover/focus identifies the canvas port. Already-added programmable choices are
  disabled without an Incompatible badge. Splitter type changes are not exposed.
  Explicit output item rules appear beside canvas ports (one 24px icon with a +N badge).
  The logistics image stays centered at a fixed 40px size, leaving clear space for items.
  These depict configured filters, not inferred supply. None-only and empty outputs
  are muted and cannot be selected or connected; undo restores their interaction.
  Any, Any undefined, and Overflow remain rules without dedicated canvas indicators;
  bottleneck warnings and conditional overflow simulation are deferred.
- Sink: incoming materials, points per item, and estimated points/min across the group on
  unambiguous paths. DNA points have their own counter. Coupon progression is not
  modeled. Individual sink allocation is unknown.
- Gift Tree: fixed configured production, count, and power.
- Fuel generators: shared fuel, individual clocks, supplemental water and waste.
  Biomass adds a load assumption. Geothermal is excluded from the catalog.
  Alien Power Augmenters show individual matrix supply and boost contribution;
  no power-grid simulation is introduced. Generated power uses a lightning-plus symbol
  and + prefix on nodes; consumed power keeps the lightning symbol.
- Resource wells: grouped pressurizers share a resource. Each member has a clock
  and Impure / Normal / Pure satellite counts, starting at zero, with up to ten
  satellites per well. All supports Mixed and bulk edits; new members inherit
  common counts. Production sums each member’s purity-weighted output and clock.
- Solid and fluid storage: compatible variant, material streams and capacity.
  Industrial storage has two inputs and two outputs. Node footers show slots or
  m³ with storage/fluid icons instead of zero power.
- Dimensional Depot: shared plan-wide speed/capacity research.
- Truck/Fluid Truck Stations: the same fluid/freight load/unload icon buttons as trains,
  an aligned cargo selector, station fuel, and shared
  road-route assumptions (fuel per trip, vehicles, round-trip time). Fuel has its
  own upward-pointing equilateral triangle input, matching the route port width,
  and displays the selected item image.
- Train Stations: connected routes with wait assumptions
  at each stop. The shared route defines freight-car count. Each station configures its car
  positions with one inline icon button group: No transfer, Fluid · Load/Unload,
  or Freight · Load/Unload. Transfer symbols use Lucide WavesArrowDown/WavesArrowUp
  for fluid load/unload and Package/PackageOpen for freight load/unload, with tooltips. Cargo is always shown in an aligned row and is disabled
  for No transfer.
  The station node expands with one row per car and two active material ports per
  configured platform. Compact labeled dividers identify each car and its platform
  type; port side/color indicates load or unload. No-transfer positions take less
  height. There are no standalone platform nodes or platform links.
  Removing configured trailing cars is blocked until those transfers are cleared.
- Drone Ports: fuel, incoming/outgoing cargo and two-port round trips. Ownership,
  names, and destination selectors are omitted. Cargo capacity is shown only for
  a complete loop and assumes a full nine-slot load per drone.
- Transport: square arrival/departure ports connect compatible stations. A closed
  loop is required for a complete route; vehicle/train loops can have extra stops,
  while drone loops have two ports. Open chains remain editable. Triangular fuel
  inputs accept material connections; route links carry no material flow.
- Space Elevator: five phase buttons, accepting phase parts as an unlimited planning
  sink. A separate Required parts section above inputs/outputs shows item images and
  total quantities for the selected phase as reference only. There are no delivered/remaining counters. A node cannot be grouped;
  Only one can be placed in the plan, including through copy/paste.
- Links: Conveyor Mk.1–6 or Pipeline Mk.1–2, materials, and nominal tier capacity.
  Tier is stored and undoable, but does not constrain calculated flow yet.
  Link inspectors omit endpoint subtitles; route links have no tiers.

Power Storage, power-grid controls, pipeline junctions/pumps/valves, portals, and
throughput monitors remain out of scope. Transport calculations do not simulate
travel, queues, loading windows, fluid hydraulics, inventory fill, or power networks.
Transfers are configured through each platform’s direction and cargo; there are no
station-level load or unload filters.
Round-trip assumptions include docking and waiting. Routes do not yet propagate
material streams between stations; selected cargo describes their material ports.

## Connection preservation and document state

Recipe/resource/fuel/variant/program options stay visible but disabled with the
same Incompatible badge used by catalog alternatives when they would invalidate
existing links or building references. Validation includes downstream material
sets, including sushi belts, and never silently deletes links from these controls.

Route membership and stop order come from station links. Link edits and deletion
reconcile those relationships in the same undo step. Freight platforms live inside
their station configuration; copying a station includes all its platform settings.
Changing shared train length resizes every station on the route. Each fluid platform
has one inventory shared by its two ports, separate from other car positions.
Depot research is shared by every uploader and survives edits, moves, and undo.

Configured supply can be traced through an unambiguous source/storage/merger path.
Branches and feedback cycles produce an unknown rate rather than an assumed split.
This is nominal supply, not a demand/capacity solver or measured throughput.

## Data and verification

The asset parser reads fuel energy, supplemental resources, nuclear waste,
extraction cycle rates, sink values, supported buildings and imagery from Docs.
Fluid recipe quantities and fuel energy use m³, while buffer capacities are already
stored as m³ in Docs. Well satellite rate, supported drone fuels, and current
Project Assembly phase requirements fill gaps in Docs explicitly.

Mechanics references:

- [Resource wells](https://satisfactory.wiki.gg/wiki/Resource_Well_Extractor)
- [Clock speed](https://satisfactory.wiki.gg/wiki/Overclock)
- [Smart splitter](https://satisfactory.wiki.gg/wiki/Smart)
- [Alien DNA points](https://satisfactory.wiki.gg/wiki/Alien_DNA_Capsule)
- [Alien Power Augmenter](https://satisfactory.wiki.gg/wiki/Alien_Power_Augmenter)
- [Truck and Fluid Truck Stations](https://satisfactory.wiki.gg/wiki/Truck_Station)
- [Drone Port](https://satisfactory.wiki.gg/wiki/Drone_Port)
- [Depot research](https://satisfactory.wiki.gg/wiki/Dimensional_Depot_Uploader)
- [Project Assembly requirements](https://satisfactory.wiki.gg/wiki/Space_Elevator)

Assets were prepared/staged from `.assets/extracted/en-US-fm8YO8`. Focused tests
cover calculations, settings, connection preservation, tiers, reference cleanup,
copy/paste and history. Server rendering covers every production recipe and new
building. Browser visual/touch verification requires a connected browser.
