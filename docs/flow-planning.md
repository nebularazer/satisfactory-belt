# Flow planning

Flow nodes represent machine groups. Material links can share compatible inputs and
outputs without physical belt/pipe capacity or splitter requirements. Build mode and
conversion remain deferred. The app opens the editable modular-frame and recycling
references; refreshing restores them.

## Targets, clock and automatic sizing

A production group's inspector exposes a target for each output and a clock speed.
Targets are gross production rates, not additional exports: connected consumers use
that production. An unconnected target output is the final product of the plan.
Clear a target with Auto (or an empty field).

Targets and preferred clocks persist through later edits, clipboard, and undo/redo.
There are no temporary anchors, machine limits or construction-direction flags.
Changing the modular-frame target from 10 to 20 resizes its suppliers, including
extraction. Changing count preserves current production by redistributing it across
the requested number of machines at a corresponding clock. Count buttons are disabled
when this would require a clock outside 1–250%. The count is not a persistent constraint:
later demand changes can resize the group again using the chosen clock.

Automatic groups calculate whole counts at or below the chosen clock (100% by
default), sharing the workload by underclocking. For example, a target of 1,200 recycled
plastic can use 12 refineries at 166⅔%, 13 at 153.846…%, or 20 at 100%. Setting the
clock to 100% calculates 20 machines. Calculated zero clock denotes an idle group;
authored clocks remain between 1% and 250%. Flow calculations can express small
fractional utilization; physical minimum clocks are a Build-mode concern.

Standalone recipes and extractors start with a visible target equal to their initial
output. This provides the starting supply for resource-first plans. Connected placements
are automatic. Automatic extractors in a demand-led plan resize with demand. Individual
member edits retain member clock preferences; bulk clock edits replace those preferences.

Dragging from an input sizes the supplier for the required material. Dragging from
an output extends production from available supply. A downstream recipe can be sized
from its connected ingredient while other unfinished ingredients remain visible as
missing inputs. Multiple targets sum through shared suppliers. Unconstrained branches
use a deterministic feasible allocation, not historic branch proportions or connection
order. Specify targets to choose a branch mix.

## Calculation seam

`resizeFlowGroups(document, catalog)` calculates connected components from saved
constraints using a continuous linear program. Recipe ratios and material conservation
are simultaneous equations, so recycling loops use the same rules as ordinary chains.
Targets are bounded by technical document limits and their requested recipe workload. Multiple product
targets on one recipe use the largest required workload; unavoidable coproduct surplus
remains visible. Lexicographic objectives meet targets first, minimize missing input,
use finite supply for automatic terminal production, then minimize machine workload.
Missing input slack supports incomplete plans; it is never reported as real supply.
The JavaScript LP solver is contained in this module; callers do not manage its variables.

`prepareFlowPlan(document, catalog)` separately exposes ports, compatible connections,
inferred materials and cached configured-rate allocation. Per-material max flow serves
recipe inputs and exports first, explicit disposal second, and storage last. Link/port
labels are plain numbers. Recipe output numbers are configured potential, not actual
starvation-limited throughput. Inspector shortages make unfinished requirements visible.

Storage implicitly collects surplus and forwards connected flow. It has no production
target and contributes no demand to sizing. Collection is an accumulation rate, not a
simulation of inventory or time to fill. It never supplies material from an implicit
initial inventory. Optional splitters forward/filter materials without physical ratios.

External supply/export declarations remain available in the document model. The node
inspector does not expose external-flow controls or a global balance panel. Transport
and finite-delivery facilities retain their configuration UI but their continuous rates
remain unverified. Unknown rates are not interpreted as zero.

Calculations run on semantic edits, not geometry/camera/route changes. References and
unchanged node objects are retained when the calculated configuration is equivalent.
Prepared allocation results and canvas rate/icon labels are cached. Sizing and edits
are one undoable transaction. A steady-state solution does not establish startup
inventory for a recycling loop.

## Validation

Editor regressions cover persistent targets, production-preserving count edits, shortages,
shared suppliers, forward/backward placement, unfinished ingredients, reversed graph
order, equivalent purity/count changes, undo/redo, and surplus storage. The recycling
reference verifies both groups can become 20 at 100% while still collecting 600 plastic
and 750 rubber. Inspector interaction tests exercise target, count and clock controls.
Existing material-allocation, facility, canvas and configuration checks remain in place.
