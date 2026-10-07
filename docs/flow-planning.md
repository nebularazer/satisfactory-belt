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

Selecting a port offers a separate distribution canvas. Connected nodes is
the default: each directly connected canvas node keeps its allocated rate as one endpoint.
Individual machines expands those groups into their members. Both views use the same
snapshot taken when the preview opens; changing detail does not modify the saved plan.
Each endpoint currently requires one belt or pipe. Group rates above the selected connection capacity
explain the limit and offer a higher tier or individual-machine detail.
Opening allows belts up to Mk.6 or pipes up to Mk.2. Once constructed, the tier selector shows the highest
tier actually used, including feedback trunks, without regenerating the layout.
Automatic construction continues to allow the highest available tier until one is chosen manually;
manual choices stay selected across detail changes. Reopening restores
automatic selection.
Nodes can be dragged individually or as a selection; arrow keys move selected nodes.
Connected belts follow their ports and labels follow the new routes. Rearrangements
only affect the open view and reset when rebuilding or reopening. Connection editing
remains disabled, and the saved factory plan is untouched. Pan, zoom and Fit remain available. Belts use tier colors and numeric
rate labels; dedicated feedback-return belts are dashed. Machines and logistics nodes
are square and grid aligned. Splitters and mergers retain three branch ports. ELK orders interchangeable belt junction ports
to reduce crossings, keeping inputs on the left and outputs on the right. Routes use
grid-sized clearance to avoid unnecessary horizontal spacing.

Balanced layouts use equal two/three-way splits, mergers and feedback where needed.
The generator allocates large chunks to remaining demand, compares halves and thirds,
and composes reusable five/seven-way feedback patterns. Nearby factorable totals can
provide a return loop for awkward ratios. Local feedback avoids unnecessarily raising
the flow on the main trunk; every belt includes its recirculating load in capacity checks.

Equal-rate pairs connect directly. Other suppliers can split independently or pool
within belt capacity. A bounded construction pass first completes a usable pattern;
a separate bounded improvement pass retains that pattern when its budget runs out.
Both passes cache patterns for one preview. Candidates are compared by junction count,
then belt count, then return-belt count.
Individual-machine requests retain their connected-node membership. A second candidate
routes between those groups, merges supplier members and splits consumer groups locally.
Temporary group endpoints disappear when the networks join, so the result contains
only real machine endpoints and physical junctions. Groups above belt capacity remain
independent. Both candidates use the same cost comparison and final flow validation;
unsupported local ratios or a cheaper flat construction retain the flat result.
The previous construction remains a fallback. Consecutive mergers collapse when their
combined inputs fit the three-port limit. An independent validator checks every final
layout for physical ports, flow conservation, capacity, source-to-destination
reachability and equal splits for belt splitters.
Main-flow edges must be acyclic; declared return belts must close a main-flow path.
These are steady-state checks, not a startup simulation or proof of global optimality.

Liquid and gas ports use a separate pipe construction. Pipeline Mk.1 supports
300 m³/min and Mk.2 supports 600 m³/min. Three connected pipes use a T-junction;
four use a cross-junction. Both fittings allow flow in either direction through
any socket; planned branches need not have equal rates. These are the
[game's pipeline junctions](https://satisfactory.wiki.gg/wiki/Pipeline_Junction),
not directional belt splitters or mergers.
For four or more consumers, the generator prefers one shared manifold with a tap
per consumer. The first two suppliers prefer opposite ends; additional suppliers
prefer positions between them. A bounded placement solve adjusts those feed positions
to keep every segment within its pipe capacity and every fitting within its socket
count. Unfed terminal consumers connect through an elbow instead of a redundant
junction. Direct one-to-one rate matches remain separate connections. Small networks
and requests that do not fit one manifold retain the independent/pooled construction.
This favors a readable shared header over minimizing the number of fittings.
For the [standard coal setup](https://satisfactory.guru/articles/read/index/id/6/name/Coal%2BPower%2BTutorial),
three 120 m³/min extractors feed eight 45 m³/min generators at both ends and near
the middle of one Mk.1 manifold. Its total demand exceeds 300 m³/min, but no
individual segment does.
Each machine keeps
one pipe connection, and every pipe is checked against its tier. Junction throughput
has no separate limit. Pipe networks have no balancing feedback loops or ratio search.
The canvas draws fitting arms to neutral sockets on three/four separate sides,
with fixed socket positions during layout and local movement. Manifolds use a
straight header along the consumer column with short branches and feeds at their
physical stations; net flow direction does not rearrange those stations. Other
networks use ELK. Machine ports
retain their supply/consumption direction. The preview counts T-junctions and
cross-junctions separately and uses m³/min units and a two-tier legend.
Rates represent planned steady-state net flow, not enforced splits. Zero-net-flow
header segments remain physically connected. Filling, sloshing and head lift
are not simulated. Pumps, valves and elevations are not added by this view.

Generation and ELK layout each run in a dedicated worker. Manifold layout is a small,
deterministic projection of the generated header. Changing settings or closing
the view cancels pending work, terminates its workers and disposes the canvas. Results
from superseded requests cannot mount a stale view. Workers are released after both
success and failure. Each reopening takes a fresh flow snapshot; nothing is persisted
by the distribution view.

For non-manifold networks, ELK lays out and routes the network. Consumers are grouped into columns by
recipe; independent recipe branches occupy separate sections with suppliers on the
left. The preview supports one solid, liquid or gas material, direct machine connections, up to 100
endpoints and bounded rate ratios. Unsupported configurations show an explanation. Failures distinguish invalid input,
unsupported connections/materials, endpoint limits, belt capacity, bounded-construction
limits and invalid generated results. Failure to find a balanced construction within
the budget does not imply the requested distribution is impossible; a higher tier
can provide an alternative.
It does not guarantee a globally minimal balancer and does not expand existing
logistics networks.

## Validation and deferred work

Regressions cover finite supply, branch sizing, clock and limit conversions, unfinished
ingredients, surplus sinks, recycling, undo/redo, port ordering and inspector interaction.
Distribution checks cover compact constructions, direct pairs, independent and pooled
suppliers, fractional ratios, local feedback capacity, material conservation, equal splits,
invalid graphs, endpoint ID collisions and the endpoint limit.
Pipe checks cover uneven and fractional branches, multi-source flow, mixed junctions,
per-pipe capacity, three/four-port fitting types and reversed flow through the same
fitting. Manifold regressions cover the 3:8 and 6:16 coal setups, both-end/interior
feeds, capacity-driven feed repositioning, a straight header, zero-net-flow pipes,
and unchanged source plans during layout and dragging. Real ELK and movement tests keep pipes attached to cardinal sockets during
layout, dragging and committed moves. UI tests cover liquid/gas units and automatic
pipe-tier selection, capacity errors and machine expansion. Real ELK tests verify
route attachment, port ordering, layout compactness and local rearrangement. UI and worker tests cover
cancellation, stale results, close/reopen, capacity errors and failure recovery.

Deferred:

- Visual indicators for unconnected inputs that assume external supply, alongside
  Flow status and Build-mode belt-capacity colors.
- A main-canvas external-supply node with configurable material and rate. External
  declarations exist in the document model but have no inspector controls.
- Sink points/min, accounting separately for normal and DNA points.
- Verification of continuous rates for transport and finite-delivery facilities.
