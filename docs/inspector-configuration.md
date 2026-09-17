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
come last and share their light/dark colors with the canvas footer.
There is no enabled/standby setting. Editable input/output rate targets remain deferred.

## Supported bodies

- Manufacturing: shared recipe (including cross-building alternatives), individual
  clock and Sloops, required shards, amplification, configured material rates, and
  fixed or recipe-specific min/max/average power. Alternate recipes use a badge;
  nodes show variable power as Ø followed by its average.
- Miners and oil extraction: individual purity and clock; shared resource and
  compatible miner tier. Purity and miner tiers use inline button groups. Water
  extraction has clock but no purity setting.
- Smart/programmed splitters: Left, Center, and Right output lists with an always
  visible item/rule picker and Add button. Smart outputs hold at most one rule;
  programmable splitters support 64 rules total. Empty lists close the output.
  Hover/focus identifies the canvas port. Selected choices are disabled without
  an Incompatible badge. Splitter type changes are not exposed.
- Sink: incoming materials, points per item, and configured group points/min on
  unambiguous paths. DNA points have their own counter. Coupon progression is not
  modeled. Individual sink allocation is unknown.
- Gift Tree: fixed configured production, count, and power.
- Fuel generators: shared fuel, individual clocks, supplemental water and waste.
  Biomass adds a load assumption. Geothermal is excluded from the catalog.
  Alien Power Augmenters show individual matrix supply and boost contribution;
  no power-grid simulation is introduced. Generated power uses a charging symbol
  and + prefix on nodes; consumed power keeps the lightning symbol.
- Resource wells: grouped pressurizers share a resource. Each member has a clock
  and Impure / Normal / Pure satellite counts, starting at zero, with up to ten
  satellites per well. All supports Mixed and bulk edits; new members inherit
  common counts. Production sums each member’s purity-weighted output and clock.
- Solid and fluid storage: compatible variant, material streams and capacity.
  Industrial storage has two inputs and two outputs. Node footers show slots or
  m³ with storage/fluid icons instead of zero power.
- Dimensional Depot: shared plan-wide speed/capacity research.
- Truck/Fluid Truck Stations: compatible variant, load/unload, cargo, station fuel, and shared
  road-route assumptions (fuel per trip, vehicles, round-trip time). Fuel has its
  own conveyor input and displays the selected item image.
- Train Stations: connected routes with an unload item filter and wait assumptions
  at each stop. The shared route defines freight-car count. Each station configures its car
  positions with one inline icon button group: No transfer, Fluid · Load/Unload,
  or Freight · Load/Unload. Cargo is always shown in an aligned row and is disabled
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
  while drone loops have two ports. Open chains remain editable. Hexagonal fuel
  inputs accept material connections; route links carry no material flow.
- Space Elevator: phase selection, accepting phase parts as an unlimited planning
  sink. There are no delivered/remaining counters. A node cannot be grouped;
  Only one can be placed in the plan, including through copy/paste.
- Links: Conveyor Mk.1–6 or Pipeline Mk.1–2, materials, and nominal tier capacity.
  Tier is stored and undoable, but does not constrain calculated flow yet.
  Link inspectors omit endpoint subtitles; route links have no tiers.

Power Storage, power-grid controls, pipeline junctions/pumps/valves, portals, and
throughput monitors remain out of scope. Transport calculations do not simulate
travel, queues, loading windows, fluid hydraulics, inventory fill, or power networks.
The unload filter stores the cargo allowed to leave the train at this stop; an
empty list means any cargo. It respects platform direction and currently does not
affect calculated material flow. Loading is configured through each platform’s cargo.
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
