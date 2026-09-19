# Flow and Build planning — implementation plan

Status: implementation proposal based on the current code and planning discussion.
Flow and Build are working names. This document describes both modes; the
[Flow implementation](flow-planning.md) records the delivered basic-mode scope.

## Scope and decisions

- Flow represents machine groups and abstract material connections. Multiple
  compatible links may share an input or output; physical logistics are optional.
- Build represents one machine per production node, explicit logistics, material
  rates and belt/pipe capacity. A Build plan may be unfinished while being edited.
- Keep separate document types and connection semantics. Share production formulas
  and material-balance primitives. Mixed abstract/physical plans are not proposed.
- Conversion, automatic logistics construction and synchronized views are out of
  scope. Either type must be usable as a starting point.
- No mandatory startup chooser. The exact entry UX is unresolved. A nonblocking
  selector on an initially empty canvas is a candidate, not an accepted decision.
- Preserve existing per-machine settings inside Flow groups. Groups share a
  machine type and recipe/resource, but their members may have different clocks,
  amplification and purity. Do not restore the earlier uniform-settings assumption.

The first validation target is sustainable configured production under a specified
steady-state model. Head lift, spatial construction constraints, startup transients
and vehicle scheduling are not included. Existing facilities outside the supported
analysis must remain explicitly unverified; their presence must not yield a false
claim of complete logistics validity.

## Current code and the opportunities to deepen it

| Location                           | Current behavior                                                                        | Planned change                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `factory-core/src/index.ts`        | Node types, member settings, display layout, power and validation coexist               | Separate domain types/calculations from display projection                     |
| `production.ts`                    | Calculates configured input/output rates, including member differences and extraction   | Reuse formulas; remove its call through display resolution                     |
| `machine-settings.ts`              | Member identity, resize and operating-setting edits                                     | Preserve Flow behavior; prevent Build resizing at the domain seam              |
| `semantic-ports.ts`                | Derives semantic ports from rendered ports                                              | Derive ports from domain configuration, then project them for drawing          |
| `links.ts`                         | Many-to-many links, material propagation, informational tier                            | Separate Flow links and physical Build connections; centralize legality        |
| `configured-flow.ts`               | Traces nominal supply only along unambiguous paths; returns unknown for branches/cycles | Replace with plan analysis when callers can consume its explicit result states |
| `configuration.ts`, `placement.ts` | Separate validation paths for configuration and placement                               | Use the same domain rules as connection commands                               |
| Web `factory-editor.ts`            | History, gestures, edits, caches, validation and tier limits                            | Keep orchestration; delegate semantic decisions                                |
| Web `inspector-link.tsx`           | Owns belt/pipe capacity constants                                                       | Move equipment definitions to game-data and consume them everywhere            |
| `game-data`                        | Recipe data, extraction base rates/purity, facilities                                   | Extend with verified physical sockets and transport/junction definitions       |

The deepening target is the cluster that currently makes callers coordinate ports,
production, material propagation and validation. Its dependencies are in-process:
immutable documents and catalog data. Inject those values; no remote adapters,
repository abstractions or dependency-injection framework are needed.

## Module ownership

Keep the existing package structure. Add focused internal files, not new packages
for every calculation.

| Module                                         | Interface responsibility                                                       | Hidden implementation                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Game catalog in `game-data`                    | Verified production/equipment definitions                                      | Asset extraction, normalization, physical socket mapping and tier data                  |
| Factory domain in `factory-core`               | Prepare a plan, query ports/connections, validate edits and analyze production | Flow/Build rules, material propagation, occupancy, constraints, solving and diagnostics |
| Display projection in `factory-core` initially | Turn domain facts into node/link display values                                | Labels, port positioning, power formatting and card geometry                            |
| Web factory editor                             | Commit edits atomically; expose snapshots                                      | History, clipboard identity remapping and analysis scheduling/cache reuse               |
| Canvas modules                                 | Render and manipulate generic ports and lines                                  | Geometry, hit testing, gestures and Pixi rendering                                      |

The important seam is between editor and factory domain. Mode-dependent reasoning
belongs behind that seam. Display and canvas callers receive facts and capabilities,
not instructions for implementing their own connection or capacity checks.

Keep projection in a separate source file first. Moving it to another package is
unnecessary for this work. Pure calculation files must not import display functions
or require node bounds. Retain generic canvas geometry dependencies where currently
needed; a repository-wide dependency cleanup is not required.

## Document model

Introduce `FactoryDocument = FlowDocument | BuildDocument`, discriminated by a
required `mode: "flow" | "build"`. Preserve routes, depot research, positions and
manual route guides as applicable. Audit every document reconstruction and copy
operation, including facilities and their cross-references.

Share the definition of production configuration and `MachineMember` settings.
Flow production nodes keep a nonempty member collection. Build production nodes
use a single `machine: MachineMember` value. Logistics nodes represent one device.
This makes a grouped Build machine unrepresentable in normal typed construction;
validate imported/runtime data as well.

Flow ports retain material identity and accept multiple links. Build ports use
stable physical socket IDs, independent of the selected recipe. Recipe changes
change a socket's material assignment, not its identity. Define deterministic
recipe-to-socket assignments in catalog/domain data, including inactive sockets.

Flow links have material endpoints and no capacity-bearing tier. Build connections
identify physical endpoints and equipment. Belts are directed; pipe network edges
need bidirectional internal flow semantics even when the canvas draws them with an
orientation. Extend the canvas projection only as needed; never interpret visual
left-to-right routing as a physical pipe constraint.

Build transport definitions supply capacity and units. Choose an explicit default
equipment definition at creation so the inspector and solver never disagree about
an absent tier. Keep Flow's current optional logistics topology, but do not interpret
it as physical capacity. Removing that optional feature is not needed for this plan.

Resource wells currently bundle a pressurizer and satellites into one facility.
That conflicts with one physical machine per Build node. Preserve the aggregate in
Flow; model the pressurizer and individual extractors with shared well references
in Build before declaring resource wells supported there. Do not merely set the
aggregate's member count to one and call it an individual machine.

No compatibility migration is required for this prerelease project. Update examples,
fixtures and loaders to the explicit schema; reject unsupported documents clearly.
Do not silently reinterpret tiered abstract graphs as physical networks.

## Proposed domain interface

Names below illustrate the seam; implementation may refine their spelling.

```typescript
const plan = preparePlan(document, catalog);

plan.ports(nodeId); // Domain ports, no canvas coordinates.
plan.connectionTargets(port); // Legal targets for previews/search.
plan.checkConnection(a, b); // Structured legality and reason.
plan.apply(edit); // Accepted immutable document or rejection.
plan.analyze(); // Configured feasibility and diagnostics.
```

`preparePlan` validates the document and builds reusable indexes. Malformed imports
return structured errors through a load/validation entry point; they must not crash
rendering. The prepared object is bound to one immutable semantic snapshot. Its
queries have no observable side effects; its indexes and lazy analysis are private.
IDs are supplied by the editor, allowing deterministic fixtures and no domain I/O.

`apply` handles semantic edits: placement with an optional connection, connection
creation/removal, configuration, member settings/count and transport selection.
It returns the complete atomic result and affected identities. Geometry edits stay
in the editor. Bulk paste is validated as one edit so it cannot partially commit.

Preview and commit use the same implementation, with commit rechecking the current
snapshot. Occupied sockets, illegal counts, wrong materials and invalid equipment
are rejected. Shortages, missing connections and insufficient capacity are accepted
as draft states and reported by analysis. Configuration changes that would invalidate
existing connections are rejected with affected link IDs; users can disconnect and
retry. This replaces the current differing reject/prune behaviors deliberately.

Internal Flow and Build implementations generate their rules and constraints.
Keep them private, using concrete dispatch on the document discriminator. Avoid
exporting a generic mode-plugin interface: callers should not assemble policies.

Return diagnostic codes and references to nodes, ports or connections; presentation
owns messages. Return typed capability facts for count controls, physical tier
controls and configuration eligibility. Do not infer mode from node count or links.

This interface earns depth by hiding the same coordination from placement, direct
linking, inspector edits, paste and import. It is not a wrapper that merely forwards
existing helpers unchanged.

## Calculation model

### Shared configured production

Reuse `resolveProduction` arithmetic and extract power calculation from display
resolution. Calculate each member first and sum for Flow; Build uses one member.
Power is nonlinear with operating settings, so averaging clocks before calculating
power is incorrect. Preserve unknown values and variable power ranges.

These are configured rates and power, not a prediction of actual operation during
starvation. Analysis must not overwrite them with delivered flow or silently reduce
machine clocks to make an infeasible plan appear valid.

### Shared balance primitives

Represent rates in items/min or m³/min according to material. Build indexes once,
then assemble conservation constraints for material transfers and recipe ratios.
Support cycles explicitly; a topological traversal alone is insufficient.

Define explicit external supply and output/export declarations as analysis inputs.
Proposed storage is document metadata attached to material ports, with small inspector
controls, rather than new canvas node kinds. They are intentional factory limits;
a disconnected port does not automatically create unlimited supply or disposal.
Build declarations must map to physical sockets and occupy them appropriately.
Reject simultaneous internal and external physical use of the same socket.

Each consuming machine must receive its configured ingredients, and sustained
production must have a destination for every coupled output. Report missing external
assumptions separately from wrong material or insufficient capacity. Unknown source
rates and finite storage inventory are not continuous supplies.

### Flow constraints

Flow links have nonnegative material allocations and no transport capacity. Enforce
conservation: multiple outgoing links share one available supply, and multiple
incoming links contribute to one demand. Optional logistics filters still constrain
material compatibility, but do not add physical socket occupancy or tier limits.

First solve whether all configured production can be sustained. If several edge
allocations satisfy it, label the returned allocation as one feasible allocation;
do not present it as uniquely determined. Use stable ordering for reproducible
results. Allocation preferences and a shortage-priority optimizer are deferred.

### Build constraints

Add physical occupancy, explicit branching, shared transport capacity, material
filters and equipment behavior. Mixed belt materials share a connection's capacity;
capacity does not apply independently to each material. Reject fluid mixing.

Model pipe flow as signed flow on an edge with absolute value bounded by capacity,
and conservation at junctions. This is a steady-state capacity model, not hydraulic
or startup simulation. Surface that scope in the analysis description.

Splitters and overflow behavior require an explicit equipment constraint model.
A generic feasible network flow is insufficient evidence that equipment can realize
that allocation. Implement and test the supported equipment rules before marking
those networks verified. Preserve current conservative mixed-material compatibility
checks. Unsupported behavior must produce an unverified result, not a valid result.

### Solver and result contract

Use a constraint formulation for coupled recipes and cyclic networks. Establish
feasibility with configured production fixed; do not initially build a full dynamic
simulation or optimization UI. Continuous balance/capacity constraints are linear;
equipment priorities may require additional state handling or integer constraints.
Keep solver choice internal until representative fixtures establish what is needed.

A bounded implementation spike should solve a branch, a constrained shared segment,
a recycled byproduct loop and a splitter/overflow case. Compare a small specialized
implementation with a maintained solver only if the constraint complexity warrants
it. Verify dependency/runtime compatibility at that point; no solver dependency is
selected by this planning document.

Expose separate result fields for structural validity, data completeness and
configured-rate feasibility. Suggested feasibility states: feasible, infeasible,
unverified. A solver timeout or missing equipment semantics is unverified.

For feasible cases return a labeled allocation. For infeasible cases return the
constraint violations/bottleneck evidence the implementation can substantiate.
Do not invent exact delivered rates or which consumer starves without a specified
allocation policy. A later achievable-throughput calculation can add that policy
without changing configured production semantics.

Use documented numeric tolerances scaled to rates, and terminate cycle handling.
A steady-state recycling solution does not prove startup feasibility. Exclude free
circulation that has no source, sink or recipe purpose from reported allocations.

## Editor, inspector and startup integration

Refactor the editor to retain history and geometry, while semantic commands call the
prepared domain module. Existing `canPlace`, `canConfigure`, direct connection and
commit paths must agree. Check the domain invariant even if a control is hidden.

Feed existing canvas connection callbacks from the domain. Project Build socket
positions independently from Flow material port positions. Pipe semantics may need
an extension to the generic direction contract; review `canvas-core/src/ports.ts`
and connection gestures together rather than spoofing pipe sockets as belt outputs.

The inspector consumes cached analysis, not `configuredIncomingRates` independently
per selected node. Show configured rates separately from a feasible allocation.
Flow gets member count/settings; Build gets single-machine settings and connection
equipment. Equipment options and capacities come from the catalog for both display
and validation.

No blocking startup question. Proposed, pending UX agreement: an empty Flow canvas
with a visible Flow/Build selector, changeable before first placement. After that,
the type is informational. Alternative entry controls may replace this without
changing the domain: document creation always receives an explicit type. Preserve
type through undo, deletion and reopening. If adopting a first-placement lock,
record it outside undoable graph contents so undo cannot enable a conflicting mode
while redo still contains old nodes. New-plan handling must preserve existing work;
a plan library or new persistence system is not included here.

The earlier chooser mockup in `work/visualizations/plan-start.html` is superseded
and is not an implementation reference.

## Performance contract

- Connection hover uses cached material and occupancy indexes, never the rate solver.
- Movement, routing and camera changes reuse semantic analysis. A semantic cache key
  includes mode, configuration, topology, equipment and external declarations.
- Build adjacency once per semantic snapshot. Eliminate rebuilding the whole
  connection index for each edge during configuration reconciliation.
- Start with full analysis per semantic edit and measure representative large
  documents. Reuse unaffected connected networks if profiling justifies it.
- If solving blocks interaction, move the same pure analysis into a worker. Tag
  results by semantic revision and discard stale replies. Do not introduce a worker
  protocol before measurements justify it.

## Delivery sequence

| Step                                           | Concrete work                                                                                               | Exit evidence                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Separate domain facts from display          | Extract domain types, validation, power and ports; preserve existing group/member behavior                  | Existing rates, mixed settings, material compatibility and editor behavior pass focused tests                |
| 2. Add explicit plan types                     | Flow/Build documents, single-machine Build nodes, typed clipboard fragments and runtime validation          | Build cannot acquire groups through placement, edits, paste or loading; document metadata survives history   |
| 3. Establish equipment data and Build topology | Centralize tiers/capacities; add physical sockets, recipe assignment, junctions and pipe endpoint semantics | Occupied ports reject additional connections; legal explicit branches work; geometry does not determine flow |
| 4. Deepen the editing seam                     | Route semantic commands/previews through prepared domain state; remove duplicate rule paths                 | Preview/commit agree; atomic paste; invalid reconfiguration preserves the document                           |
| 5. Implement shared analysis and Flow balance  | External declarations, constraint spike, configured-rate feasibility, explicit unknowns, cyclic balance     | Shared supply is never duplicated; multi-output recipes and cycles conserve material                         |
| 6. Add Build feasibility                       | Equipment distribution rules and belt/pipe constraints; diagnostics and solver limits                       | Capacity bottlenecks detected; verified cases obey equipment semantics; missing support yields unverified    |
| 7. Integrate the UX                            | Agreed nonblocking entry, mode-specific inspector, cached analysis and diagnostic display                   | Both types can be started; no conversion or mixed plans; incomplete plans remain editable                    |

Steps 1–4 establish stable domain contracts before solver/UI integration. Steps 5
and 6 share primitives but have separate rule fixtures. Step 7 requires the startup
interaction decision. Interim topology-only milestones are not completion of the
requested Build scope.

## Verification through the interface

Use small injected catalogs and immutable documents. Test behavior through the
factory domain interface and the editor where history matters. Keep existing
formula cases, including mixed clocks, amplification and purity; move them as needed.
Replace redundant internal-helper tests when equivalent interface coverage exists.
No new tests are needed for unchanged rendering or basic arithmetic duplication.

Required cases:

- Equivalent Flow members and individual Build machines yield the same configured
  material totals and power; differing clocks are calculated per member.
- Flow fan-out/fan-in shares supply correctly. A 120/min source can satisfy two
  60/min demands, but cannot satisfy two 90/min demands.
- Build rejects a second connection on an occupied socket. Explicit branching
  permits the topology; a shared 90/min segment still cannot carry 120/min demand.
- Mixed materials share one belt capacity. Pipe junctions conserve one fluid and
  respect capacity regardless of canvas placement or edge storage orientation.
- Multi-product recipes require destinations for coupled outputs. Feedback cycles
  terminate; unsupported startup assumptions are not claimed as verified.
- Unknown rates, storage-only apparent supply, missing external declarations and
  unsupported transport behavior are not silently treated as zero or unlimited.
- Changing a tier changes feasibility without changing configured production.
- Preview, placement, configuration and direct linking apply identical rules.
- Undo/redo, deletion and clipboard operations preserve type, physical occupancy,
  member identities and existing facility references.
- Geometry-only edits reuse analysis; stale async results cannot replace new ones
  if worker execution is introduced.

For each implementation slice run the relevant Vitest suites, formatting, lint,
TypeScript checks and affected builds. Perform browser QA for entry, ports and
inspectors once those change. Planning-only edits require formatting/diff checks,
not a full application test run.

## Open decisions and explicit non-goals

Before their implementation steps, resolve:

- Final names and the nonblocking startup control/default. No chooser or automatic
  intent inference is assumed by the domain.
- Exact external supply/export controls and supported equipment semantics,
  especially pipe junctions, splitter overflow and resource wells.
- Whether the product needs predicted shortage distribution now. This plan proposes
  configured-rate feasibility first, with exact starvation predictions deferred.

No mixed-mode graph, conversion, automatic logistics layout/synthesis, dynamic
simulation, head-lift model, vehicle scheduling, README changes or GitHub CI work.
