# Automatic factory planner

Status: draft for iteration. This change contains planning only.

## Goal

Describe desired production, available supplies, recipe choices and optimization
priorities; calculate a sustainable factory; review it; then create it on the
canvas in Plan/Flow or Build mode.

The generator chooses recipes and creates topology. It complements the existing
work on sizing and analyzing a user-created graph.

## Repository context and dependencies

This proposal starts from `main` at `d84c716`. The current factory domain supports
machine groups, individual member settings, recipes, extraction and material links.
`game-data` supplies recipe ingredients/products, alternate flags, material units
and production/power parameters. The web editor owns document edits and undo/redo.

The separate `feat/flow-planning` branch contains Flow planning and documents for
Flow/Build modes. Those are not present on this base. Integrate or reconcile that
work before implementing mode-specific generation; do not assume its APIs already
exist on `main`. In this document, **Plan** means the abstract **Flow** mode from
that proposal. Final UI naming remains open.

Build generation adds automatic logistics construction, which the existing modes
proposal explicitly deferred. Treat it as a separate implementation milestone.

## User workflow

1. Open the automatic planner and add one or more output targets.
2. Optionally enter existing input supplies and resource limits.
3. Choose allowed and required recipes, then order optimization priorities.
4. Calculate and review production, inputs, buildings, power and warnings.
5. Adjust assumptions and recalculate without changing the canvas.
6. Select Plan/Flow or Build, preview placement, then create the factory in one
   undoable operation.

Keep the canvas central. Use a compact configuration panel with a result preview;
specific component choices and wireframes can follow the domain decisions.

## Request semantics

### Expected outputs

- Each target identifies a material and net export rate, in items/min or m³/min.
  Export is what remains after internal consumption, not gross recipe output.
- Default to a minimum target. Offer exact output when surplus export is unwanted;
  any remaining coproduct still needs a valid destination.
- Validate finite, nonnegative values and combine duplicate material rows visibly.
- Allow several targets to share intermediate production and coproducts. Solve the
  whole factory together rather than planning each target independently.
- A maximize-output objective selects a material and requires finite limiting
  inputs or other proven bounds. It still respects all fixed output targets.

### Optional preexisting inputs and raw resources

- An existing input is an external continuous supply with a maximum available
  rate. The optimizer may use less; show used and unused amounts separately.
- Add a must-consume option for a stream that must be taken in full. This is useful
  for an existing byproduct stream and may make a request infeasible.
- Default to preferring existing supply before manufacturing more of that material;
  show this as an explicit priority that the user can change.
- If an input is absent or insufficient, manufacture the shortfall back to raw
  resource boundaries. Offer an input-only restriction per material when making
  that material internally is unwanted.
- Raw resources may be uncapped for fixed-target planning, but display every such
  assumption. Users can cap or exclude each resource. Uncapped does not imply that
  extraction sites exist in a particular save.
- Raw resource boundaries come from supported catalog extraction definitions, not
  from treating every material with no available recipe as free supply.
- Finite inventory is not continuous supply. Unsupported sources produce a clear
  diagnostic rather than an invented production rate.
- Input rows initially describe external rates. Binding them to existing canvas
  ports is a later option and must use explicitly allocated spare capacity, not a
  producer's full configured output.

### Recipe choices

Use three explicit states for recipes, including standard recipes:

| State    | Meaning                                                         |
| -------- | --------------------------------------------------------------- |
| Excluded | The solver cannot use this recipe.                              |
| Optional | The solver may use this recipe if it helps satisfy the request. |
| Required | The solution must use this recipe at a meaningful minimum rate. |

Default standard recipes to optional and alternates to excluded until selected.
Allow users to mark selected alternates optional or required. Show recipe inputs,
all outputs and compatible buildings alongside the choice.

Proposed **required** semantics: require a user-visible minimum recipe cycle rate
or designated product contribution. Do not implement it as an arbitrary epsilon,
which could satisfy the choice with negligible production. Prefill a contribution
from the relevant target when possible; otherwise require a value before solving.
Also offer a separate **exclusive producer** restriction for a chosen material:
only the designated recipe may manufacture it internally. External supply remains
controlled by the input settings. These meanings need confirmation during iteration.

Multiple required recipes may coexist. Conflicts, unavailable recipes and required
recipes that force unwanted production must be explained, never silently relaxed.
Exclude unsupported/event-only production unless explicitly enabled with the
necessary catalog data. Progression restrictions require a data audit first.

## Optimization and hard limits

Hard constraints always take precedence over preferences. Start with ordered
priorities (lexicographic optimization), with clear tie-breaking. Avoid combining
unrelated units into one opaque score.

| Optimization    | Definition and safeguards                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Power           | Minimize modeled consumption under the selected operating policy; show the included facilities and power range where relevant.               |
| Building count  | Minimize actual buildings, not canvas group count or fractional machine equivalents. Distinguish production/extraction from Build logistics. |
| Material input  | Minimize a selected external material, or an explicitly weighted set of resource/import rates. Do not silently add items and m³.             |
| Material output | Maximize selected net export with finite bounds; optionally minimize unwanted surplus instead.                                               |

Example priority order: satisfy output and recipe requirements; prefer existing
inputs; minimize a scarce raw resource; minimize power; minimize building count.
The user can reorder preferences. Show achieved values and explain that lower
priorities cannot worsen higher ones beyond a documented numerical tolerance.

Support hard caps on input rates, power and building count as the corresponding
models become available. Report infeasible constraints without substituting an
underproducing factory. If showing a closest alternative, label its shortfalls and
keep it separate from a successful result.

Use a declared clock policy: initially up to 100%, no amplification, a documented
minimum clock, and finite machine-count bounds. Power minimization must not keep
adding underclocked machines without limit. Overclocking and amplification need
explicit shard/sloop budgets before becoming optimization choices.

Do not claim exact power optimality from a linear recipe-rate model. Actual count
and nonlinear per-machine power require an integer/settings model or an explicitly
labeled approximation, followed by evaluation with shared domain formulas.

## Material balance and feasibility

For every material at steady state:

`external input + recipe production = recipe consumption + export + disposal`

Resource extraction contributes supply through a declared boundary or modeled
extractor, never both. Capacity limits apply to net available external supplies.
Recipe products are coupled: using one product also creates the others.

- Model shared intermediates, coproducts and recycling loops simultaneously using
  constraints. A recursive recipe tree alone cannot handle these correctly.
- Every byproduct needs internal consumption, explicit export or supported disposal.
  Storage accumulation is not a sustainable destination for continuous production.
- Disposal is opt-in and material-specific. Include supported disposal facilities
  in count and power totals; reject unsupported disposal rather than deleting flow.
- Separate steady-state feasibility from startup feasibility. Cycles may require
  seed inventory; expose that limitation without claiming startup simulation.
- Preserve unknown production/power information. If a requested objective depends
  on missing data, report it as unsupported rather than treating it as zero.
- Distinguish optimal, feasible within a time limit, infeasible, unbounded,
  unsupported, cancelled and failed results. A timeout is not proof of infeasibility.

## Result and canvas creation

Return a mode-independent production solution containing chosen recipes, material
allocations, external boundaries, exports/disposal, machine configurations,
objective values and diagnostics. Keep the request and catalog identity with the
result so it can be reviewed and recalculated reproducibly.

**Plan/Flow:** create recipe/resource machine groups, abstract material links and
explicit supply/export declarations using the reconciled mode model. Show actual
member counts and settings; a fractional workload is not a fractional building.
Either include extraction groups using declared tier/purity assumptions or stop at
clearly labeled raw-resource boundaries. Totals must state which option was used.

**Build:** create individual machines and explicit supported splitters, mergers,
belts, pipes and junctions with legal sockets and capacity. Expand resource sites
only when extraction assumptions are supplied. Validate equipment allocation and
every material route with Build analysis. An abstract balance solution alone is
insufficient to promise a realizable Build factory.

Build optimization must include logistics if it claims to minimize total buildings
or power. If production is optimized first and logistics added heuristically, label
the resulting scope and optimality accordingly. A failed routing step must return
diagnostics or a clearly identified draft, not a verified factory.

Use ELK for graph layout, with resource/import boundaries upstream and exports
downstream where possible. Cycles need deliberate routing. Canvas layout represents
a schematic, not an in-game floor plan or validated pipe head lift.

Creation appends at a chosen canvas location, preserves existing content, assigns
fresh IDs and commits the complete graph as one undo/redo transaction. Revalidate
the current document and referenced ports at commit time. Cancelled calculations
or placement leave the document untouched. Keep modes separate: a result targeting
a different mode should create a separate document, not mix mode semantics.

Editing the generated factory remains normal manual editing. Automatic regeneration
of a previously inserted region is deferred until ownership and manual-edit rules
are designed.

## Implementation boundaries and performance

- Keep production formulas, validation and document materialization in
  `packages/factory-core`; isolate pure calculations from display resolution.
- Put recipe search, optimization and solver integration in a proposed
  `packages/factory-planner` package. It accepts catalog/request snapshots and
  returns domain results without React, Pixi or canvas-coordinate dependencies.
- Keep catalog normalization and missing equipment data in `packages/game-data`.
- The web app owns form state, worker scheduling, result review, layout orchestration
  and committing the document. Canvas packages render and manipulate the result.
- Run optimization outside the UI thread. Support cancellation, bounded execution,
  stale-result rejection and stable ordering for reproducibility.
- Build reusable material/recipe indexes and prune only provably irrelevant
  candidates; required recipes and coupled coproducts must survive pruning.
- Benchmark representative multi-output and cyclic factories before selecting a
  solver. Evaluate browser/worker compatibility, license, size, numerical behavior,
  integer support and cancellation. Do not add a dependency in this planning change.

## Delivery sequence and relevant validation

1. **Resolve contracts:** settle the questions below, reconcile Flow/Build work,
   audit catalog coverage, and define requests/results and boundary semantics.
2. **Solver spike:** exercise shared intermediates, required alternates, coproducts,
   a recycling loop and constrained output maximization. Establish finite bounds,
   numerical tolerances and a performance budget before committing to a solver.
3. **Production planning:** deliver fixed output targets, capped optional inputs,
   raw-resource fallback, recipe states and ordered input/workload objectives.
   Report workload as workload until actual building/settings optimization exists.
4. **Operating optimization:** add actual building counts and bounded clock/power
   optimization; compare candidate configurations using domain calculations.
5. **Plan/Flow creation:** deliver editable request UI, result review, layout and
   atomic insertion. Verify preview/commit agreement and undo/redo behavior.
6. **Build creation:** add supported physical equipment, capacity-aware topology
   and validation. Expose supported coverage before enabling creation.

Focused tests should establish balance and net exports, shared input caps,
must-consume streams, no arbitrary intermediate imports, optional versus required
recipes, exclusive-recipe conflicts, coproduct disposal, cyclic balance,
unbounded-output detection, actual counts after clock allocation, objective order,
unknown-data diagnostics, worker cancellation and atomic canvas insertion. Build
fixtures must verify socket occupancy, branching and shared transport capacity.
Use small fixtures with known outcomes; validate returned solutions independently
of the solver's success flag. Agree latency/size targets during the spike.

## Suggestions for later scope

These are candidates for discussion, not accepted implementation requirements:

- Save reusable recipe/resource presets and compare a few objective scenarios.
- Apply unlock tiers and alternate-recipe availability from a player profile.
- Describe actual extraction sites, purity and equipment rather than resource caps.
- Bind imports/exports to selected existing canvas ports with reserved capacity.
- Optimize construction materials, footprint or transport complexity as separate
  measures from continuous production inputs.
- Include a self-powered factory option that accounts for fuel, generation and waste.
- Add startup inventories for recycling and finite delivery/time-to-completion goals.
- Offer understandable conflict explanations and suggested constraint relaxations.

## Questions for the next iteration

1. Should a required alternate mean a minimum contribution, exclusive production,
   or both controls as proposed? What should its default contribution be?
2. Should existing supplies be preferred automatically, or compete solely on the
   user's optimization priorities?
3. Should raw-resource boundaries or assumed extractor groups be the default?
4. Which optimization should be the default, and what machine-count/clock bounds
   are acceptable for power optimization?
5. Should surplus export be allowed by default, with disposal always opt-in?
6. Is shipping Plan/Flow generation first acceptable while Build construction and
   validation are completed in the following milestone?
