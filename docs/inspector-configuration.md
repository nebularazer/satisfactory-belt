# Inspector configuration

Single-node or single-link selection opens the inspector. Multiple selected canvas
nodes do not. Machine groups retain the All/member tabs; settings under All show
Mixed when appropriate and write to all members. Numeric drafts clamp on Enter or
blur, integer settings round, and empty/non-numeric drafts restore the prior value.
There is no enabled/standby setting. Editable input/output rate targets remain deferred.

## Supported bodies

- Manufacturing: shared recipe (including cross-building alternatives), individual
  clock and Sloops, required shards, amplification, configured material rates, and
  fixed or recipe-specific min/max/average power.
- Miners and oil extraction: individual purity and clock; shared resource and
  compatible miner tier. Water extraction has clock but no purity setting.
- Smart/programmed splitters: per-output item/Any/None/Any undefined/Overflow rules,
  up to 64 total on programmable splitters. Hover/focus identifies the canvas port.
- Sink: incoming materials, points per item, and configured group points/min on
  unambiguous paths. DNA points have their own counter. Coupon progression is not
  modeled. Individual sink allocation is unknown.
- Gift Tree: fixed configured production, count, and power.
- Fuel generators: shared fuel, individual clocks, supplemental water and waste.
  Biomass adds a load assumption. Geothermal uses individual purity and power range.
  Alien Power Augmenters show individual matrix supply and boost contribution;
  no power-grid simulation is introduced.
- Resource wells: one pressurizer with a shared resource and clock, plus satellite
  extractors with separate purities. Satellite extraction is aggregated at the
  well output; the pressurizer consumes power once. The catalog also finds wells
  when searching for resource-well extractors or Nitrogen Gas.
- Solid and fluid storage: compatible variant, count, material streams and capacity.
- Dimensional Depot: count and shared plan-wide speed/capacity research.
- Truck/Fluid Truck Stations: name, compatible variant, load/unload, cargo, and
  shared road-route assumptions (fuel, vehicles, round-trip time, ordered stops).
- Train Stations: name and shared train-route assumptions/timetable, with load/unload
  item filters and wait assumptions at each stop. Freight/Fluid/Empty Platforms
  have a station and position, with material/load mode on cargo platforms.
- Drone Ports: name, drone presence, destination, fuel, incoming/outgoing cargo and
  round-trip assumption. Displayed cargo capacity assumes a full nine-slot load.
- Space Elevator: phase and delivered quantities, with remaining requirements.
- Links: belt/lift Mk.1–6 or pipe Mk.1–2, materials, and nominal tier capacity.
  Tier is stored and undoable, but does not constrain calculated flow yet.

Power Storage, power-grid controls, pipeline junctions/pumps/valves, portals, and
throughput monitors remain out of scope. Transport calculations do not simulate
travel, queues, loading windows, fluid hydraulics, inventory fill, or power networks.
Round-trip assumptions include docking and waiting. Routes do not yet propagate
material streams between stations; selected cargo describes their material ports.

## Connection preservation and document state

Recipe/resource/fuel/variant/program options stay visible but disabled with the
same Incompatible badge used by catalog alternatives when they would invalidate
existing links or building references. Validation includes downstream material
sets, including sushi belts, and never silently deletes links from these controls.

Station/destination references are stable identities. Deletion clears removed
references and route stops in the same undo step. Copying a selection remaps its
internal references and clones referenced routes. A copied platform without its
station becomes unassigned to avoid duplicate platform positions. Depot research
is shared by every uploader and survives edits, moves, and undo.

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
