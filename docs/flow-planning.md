# Flow planning

Flow nodes represent machine groups. Compatible material links can share inputs and
outputs without physical belt/pipe capacity or splitter requirements. Build mode and
conversion remain deferred. Plans autosave to IndexedDB; an empty store starts from
the example plan. Unsupported saved formats are not migrated.

## Production limits and clock

The inspector has one production limit: an output rate, a machine count, or No Limit.
Output limits use items/min (or m³/min for fluids). For recipes with multiple products,
users choose the product that defines the limit; converting between products preserves
the recipe ratio. Converting to machine count rounds up to a whole count. Limits are
saved constraints, distinct from the actual flow achievable with connected supply.
Clearing the limit releases the constraint rather than retaining the previous rate.

Auto clock calculates the required clock using whole machines. A machine-count limit
can keep, for example, four machines running at a lower clock. Set clock uses an
explicit percentage; Set 100% is a shortcut. Selecting a manual clock with No Limit
captures the current whole-machine count as a machine limit. A per-machine selection
allows individual clocks, including three machines at 100% and one at 50%. Miner tier
and purity belong to the whole group and cannot be changed for an individual member.

Automatic suppliers follow downstream requirements. Finite suppliers bound achievable
production, so a requested output may exceed actual output. Unconstrained terminal
production establishes demand when there is no finite supply driving the component.
Explicit limits choose the intended mix when several branches share supply. Placement
from an input sizes its supplier to demand; placement from an output sizes a consumer
from available supply. Other unfinished ingredients assume external supply.

Node subtitles show used machine equivalents rather than an authored machine limit.
Ports expose actual flow and configured limits/capacity where applicable. The port
inspector lists connected machines, recipes and allocated rates. Common fractional
clock values use mixed fractions; displayed rounding never changes calculation
precision. Unchanged input focus/blur does not commit a rounded value.

The inspector retains Inputs, Outputs, power-shard and Somersloop counts, and power
usage. Recipes cannot be changed after placement. Up/down buttons reorder material
ports, splitter outputs and merger inputs. Stable port keys keep links and splitter
rules attached; only positions change. Order is saved per node and supports undo/redo.
Mobile catalog and inspector sheets use 60% height, remain scrollable and allow canvas
interaction. Opening the catalog closes the inspector presentation.

## Calculation seam

`resizeFlowGroups(document, catalog)` solves connected production components with a
continuous linear program. Recipe ratios and material conservation are simultaneous
equations, including recycling loops. It meets feasible targets within authored
constraints, then minimizes unnecessary external input, surplus and machine workload.
Unconnected ingredients assume external supply; once connected, only their actual
suppliers can feed them. This assumption is not material delivered by a link.

`prepareFlowPlan(document, catalog)` exposes semantic ports, compatible connections,
inferred materials and cached material allocation. Production consumers receive
material before surplus disposal and storage. Link labels show actual allocated rates
as plain numbers. Physical belt capacity does not constrain Flow-mode allocation.

Storage collects surplus and forwards connected flow. It has no production target,
contributes no demand to sizing and cannot supply implicit initial inventory. Splitters
forward/filter material without physical equal-split ratios in the main flow plan.

Production edits and their sizing consequences form one undoable transaction. Port
reordering changes layout without resizing production. Camera, movement and route edits
do not request a new production solution. A steady-state recycling solution does not
establish the inventory needed to start the loop.

## AWESOME Sink

Sinks consume surplus after production consumers. They do not cause unconstrained
upstream production to grow just to feed them. Automatic suppliers can reduce output
as demand falls; author an output or machine limit to keep finite supply available for
sinking. Automatically calculated machine counts are not capacity limits.

Sinks have no rate or mode setting. Their input lists show actual allocated rates.
Saved plans containing the removed sink rate setting are rejected.

## Distribution preview

Selecting a port offers a separate, read-only distribution canvas. It expands directly
connected machine groups into individual suppliers and consumers without modifying
the saved plan. Pan, zoom and Fit remain available. Belts use tier colors and numeric
rate labels; dedicated feedback-return belts are dashed. Machines and logistics nodes
are square and grid aligned. Splitters and mergers retain three ports, using the outer
two when only two are connected.

Balanced layouts use equal two/three-way splits, mergers and feedback where needed.
Feedback capacity includes recirculating material. Manifolds show steady-state rates
after consumer buffers fill; manifolds with sinks are excluded because sinks do not
back up at a target rate. Equal-rate pairs connect directly. Other suppliers split
independently, merging only when needed by consumers or return loops.

ELK lays out and routes the network in a worker. Consumers are grouped into columns by
recipe; independent recipe branches occupy separate sections with suppliers on the
left. The preview supports one solid item, direct machine connections, up to 100
endpoints and bounded rate ratios. Unsupported configurations show an explanation.
It does not guarantee a globally minimal balancer and does not expand existing
logistics networks or fluids.

## Validation and deferred work

Regressions cover finite supply, branch sizing, clock and limit conversions, unfinished
ingredients, surplus sinks, recycling, undo/redo, port ordering and inspector interaction.
Distribution checks cover direct pairs, independent splitting, feedback capacity,
material conservation and equal splits.

Deferred:

- Visual indicators for unconnected inputs that assume external supply, alongside
  Flow status and Build-mode belt-capacity colors.
- A main-canvas external-supply node with configurable material and rate. External
  declarations exist in the document model but have no inspector controls.
- Sink points/min, accounting separately for normal and DNA points.
- Verification of continuous rates for transport and finite-delivery facilities.
