# Flow planning

Flow nodes represent machine groups. Material links can share compatible inputs and
outputs without physical belt/pipe capacity or splitter requirements. Build mode and
conversion remain deferred. The app opens the editable modular-frame and recycling
references; refreshing restores them.

## Targets, clock and automatic sizing

A production group's inspector displays current output rates in equal-width fields,
with one shared production lock and a single Clock speed field showing the actual
calculated clock. − adds a machine and lowers the clock; + removes one and raises it.
Typing a percentage requests the fewest whole machines able to meet output at or
below that speed; the displayed clock then adjusts to preserve output exactly.
The adjacent info tooltip explains the controls and rounding with a worked example. Unlocked fields follow the connected
plan. Locking captures the current production; editing any output rate locks the recipe
at that rate and updates all coproducts in their fixed recipe ratio. Unlocking clears the
recipe's target. Merely focusing or blurring an unchanged field never locks it.
Targets are gross production rates, not additional exports: connected consumers use
that production. An unconnected target output is the final product of the plan.

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
maximum clock to 100% calculates 20 machines. Rebalance at 100% preserves current
output and the production lock state while selecting the fewest whole machines that
need no overclocking. Calculated zero clock denotes an idle group;
authored clocks remain between 1% and 250%. Flow calculations can express small
fractional utilization; physical minimum clocks are a Build-mode concern.

Clock and rate displays use common fractions when accurate within 1e-7 (166⅔, 83⅓),
otherwise at most two decimal places (153.85), without trailing zeros. Inputs show
the full decimal value on focus. Focusing and leaving an unchanged field never
commits a rounded value; calculations retain full precision.

Standalone recipes and extractors start unlocked at their default configuration.
Only an explicit output edit or lock action saves a production target. Without a
locked supply feeding a terminal production group, that group’s current output
provides demand for automatic suppliers. This is derived from graph topology each
time, never saved as a hidden lock. Locked supplies drive their automatic downstream
groups; set a consumer output explicitly when reserving a particular rate.
Connected placements are sized from the source port’s available supply or demand. Automatic extractors in a demand-led plan resize with demand. Individual
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
remains visible. Lexicographic objectives meet targets first, maximize terminal
production within authored limits, then minimize assumed external inputs, surplus
and machine workload. Unconnected recipe inputs assume external supply while a
plan is unfinished. Adding an upstream recipe moves the requirement upstream without
collapsing downstream production to zero. Once an input is connected, only its actual
suppliers can feed it; finite upstream capacity can reduce achievable production
without changing the authored output limit. Missing-input slack represents a planning
assumption, not material delivered by a link.
The JavaScript LP solver is contained in this module; callers do not manage its variables.

`prepareFlowPlan(document, catalog)` separately exposes ports, compatible connections,
inferred materials and cached configured-rate allocation. Per-material max flow serves
recipe inputs and exports first, explicit disposal second, and storage last. Link/port
labels are plain numbers. Link labels use a constant canvas-space font size and scale
with zoom; they have no screen-space size compensation. Their render resolution
tracks zoom and display density, matching node text. Recipe output numbers are configured potential, not actual
starvation-limited throughput. Unmet requirements remain available in a collapsed, neutral Supply details section.

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
and 750 rubber. Inspector interaction tests exercise rate editing, the shared production lock, count and clock controls.
Existing material-allocation, facility, canvas and configuration checks remain in place.

## Deferred follow-up

- Visually distinguish unconnected inputs that assume external supply. No marker or
  link-color change is included yet; consider this alongside Flow status and Build
  belt-capacity colors.

## AWESOME Sink

Sinks only consume surplus. Production receives material first; sinking then uses spare
finite supply. Automatic groups may grow to process that supply, but unconstrained
upstream sources cannot grow solely to feed a surplus sink. Automatically calculated
machine counts are not capacity limits. Authored machine/output limits and finite
extractors establish available supply.

The inspector explains that automatic suppliers reduce production as demand falls.
An authored output or machine limit keeps finite supply available for surplus.
The Inputs section displays actual allocated per-material rates. Sinks have no rate
or mode settings, and saved plans containing the removed sink rate setting are rejected.

Follow-up: display sink points/min, accounting separately for normal and DNA points.
