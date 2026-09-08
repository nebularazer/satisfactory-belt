# Satisfactory Belt

A client-side factory planner, starting with a domain-neutral infinite canvas.

## Requirements

- Node.js 24 or newer
- pnpm 11

## Development

```bash
pnpm install
pnpm dev
```

Regenerate the production catalog from the locally extracted game docs with:

```bash
pnpm extract:production
```

The extractor reads `.dev/assets/data/game-docs.en-US.json` and writes the
normalized recipe and item catalogs used by the web app.

Install Chromium once and run the real-browser canvas smoke test with:

```bash
pnpm --filter @satisfactory-belt/web exec playwright install chromium
pnpm test:e2e
```

The canvas interaction slice supports:

- searching production machines, infrastructure, or recipes; comparing production
  routes; and seeing nominal input, output, and power rates in the node picker from
  the menu or with `N`;
- opening a contextual menu with right-click: add on empty canvas, duplicate/delete on nodes;
- selecting a node with primary click and moving it with primary drag;
- adding or removing nodes from the selection with Ctrl/Cmd + primary click;
- dragging a selection box with Ctrl/Cmd + primary drag;
- panning by dragging empty space, using the middle mouse button, or Space + primary drag;
- scrolling to zoom around the pointer;
- pinching to zoom and using two fingers to pan on touch screens;
- zooming with the floating controls or `+` and `-`;
- arranging Basic or Detailed factories with the magic-wand Auto-arrange button
  beside Undo, using aligned nodes and routed connections in one undoable step;
- resetting the view with the zoom percentage or `0`;
- fitting every node with `1` (or an empty-canvas double-click), and fitting the selection with `2`;
- moving selected nodes with the arrow keys, or four grid intervals with Shift + arrow;
- copying, pasting, and duplicating selections with the standard keyboard shortcuts;
- saving the current named plan with Ctrl/Cmd + `S`, or opening Save As when the
  canvas is not associated with a named plan;
- opening Save As directly with Ctrl/Cmd + Shift + `S`;
- deleting selections with Delete or Backspace;
- undoing and redoing document changes from the controls or keyboard;
- showing optional live canvas performance metrics from the Settings menu;
- importing and exporting versioned JSON plan files; and
- selecting light, system, or dark appearance from the canvas menu.

The grid uses a fixed 32-unit interval and its dots are shown by default. Snap and
the grid dots can be switched off independently in the menu without changing the
visual scale of the canvas.

Auto-arrange runs ELK in a worker and fits the result on screen. Machines using
one recipe form a vertical stack, and parallel production steps share a stage.
Each logistics network occupies an exclusive area between recipe groups, with
one router column per forward step. Neighboring machine stacks guide its height
and port spacing, leaving room for long clear runs. Belts use separate lanes
chosen to reduce overlap and crossings, then bends, then length; unrelated group
interiors stay clear. Every physical node
and connection remains editable on the same canvas. Feedback belts use separate
return lanes with dashed strokes and no arrows; their colors still indicate flow
and capacity. The connection inspector identifies feedback returns. Positions and
connection paths are saved with the plan. Existing plans adopt the layout on their
next Auto-arrange, with undo/redo available. Basic mode shows the cards directly;
Detailed mode adds group outlines and labels. Group headers scale with zoom,
wrap or truncate within their bounds, and have subtle outlines. Click a header to
select the group and rename it in the inspector; hover to read its full name.
Custom Detailed group names survive save/reload and Auto-arrange, with rename/reset undoable.
On mobile, the build toolbar stays on one row: choose Basic or Detailed from the
mode menu, add a node directly, or open More build tools for splitters and mergers.

Selecting nodes or a group keeps their immediate connections and neighbors clear
while fading the rest of the canvas. Selecting a link focuses its two endpoints.
Faded elements remain clickable; clear the selection to restore full visibility.
Capacity colors and dashed feedback lines retain their meaning. All targets are
shown normally while drawing a new connection. Rate labels appear when zoomed in or
when a connection is selected. New connections and their previews use the same rounded right-angle style and
route around cards without moving them. Select a connection to drag its square
segment handles, double-click a segment (or use Add bend in the inspector) for an
extra detour, and use Reset route to restore automatic routing. Route edits snap
to the grid when enabled, support Escape/pointer cancellation, and form one undo
step per completed drag. Manual bends are saved and preserved where possible
when connected nodes move.

Splitters, mergers, and pipeline junctions use headerless 128 × 128 cards with a
muted building icon in the body, visible ports, and compact rate labels. See
[the compact Router card design](docs/plans/compact-router-cards.md). During
generation and Auto-arrange, splitters and mergers using two ports place them
in the outer slots, leaving the middle slot unconnected.

The mode switch shows **Create Detailed** when the Basic plan has no Detailed
version. It opens a conversion dialog with maximum conveyor and pipeline tiers,
and a plan name when the Basic plan is unsaved. Conversion and auto-arrangement
run in workers, with stage progress, cancellation, and errors that keep the
settings available for retry. The selected speed limits apply only to conversion.
The finished result opens already arranged with every conveyor and pipeline tier
available for editing. New manual links start at Mk.1; the link inspector changes
their tier. Existing saves also gain the full tier selection when opened. The
button then becomes **Detailed** and reopens the saved version, including after a
reload. Basic and Detailed still use linked saved documents; this conversion flow
does not migrate them into one save record.

The conversion dialog defaults to Mk.1 conveyors and pipes. Higher maximum
tiers can be selected; each generated connection uses the lowest available tier
that carries its flow, including feedback circulation.

Detailed generation and Basic-to-Detailed conversion use conveyor balancers:
every connected output of an ordinary splitter gets an equal share. Splitter
trees and mergers combine those shares to meet individual machine demands,
including different clocks, without relying on manifold backpressure. Ratios
such as five equal destinations use a return loop; its extra throughput counts
toward the belt capacity. Supply that exceeds one belt is automatically kept on
parallel producer feeds. Full-belt return balancers distribute returning material
across the first branches, keeping internal belts within the selected tier without
duplicating and then merging half-rate consumer feeds. Conversion preserves
machine configurations and reports genuine single-port bottlenecks: parallel
logistics cannot add extra input or output ports to a machine. Unsupported ratios
produce an error instead of a manifold. Pipeline junctions retain
their fluid-network behavior. Existing Detailed saves are unchanged; convert the
Basic plan again to generate the balanced version.

In the Basic canvas, press **N**, search for a recipe, and choose **Auto-build**
to generate a production plan for its output item. Set one or more output rates,
allow alternative recipes, or require specific recipes for outputs and ingredients.
Basic generation connects process groups directly, leaving physical distribution
to Detailed conversion (self-returning materials still need a routing node because
Basic links cannot connect a process to itself). Generated machine clocks never
exceed 100%; the minimum required machine count shares the workload evenly.
For example, 90 plates/min uses five constructors at 90%, reducing power while
keeping the same output and machine count. Auto-build extractor clock budgets are also capped at 100%.
Direct extraction supplies raw resources by default; enabled alternatives get first
consideration among manufacturing recipes. Available resource nodes can limit each
generated group to listed mineral and oil nodes, with extractor tiers, purity counts,
and maximum clocks. The generator places matching extractors and reports capacity
shortfalls. Water extractors and resource wells remain unrestricted by this budget.
Generation and arrangement run in workers with cancellable progress. The result is
added in free space and selected as one undoable operation, preserving existing nodes
and connections. Clicking the recipe row still adds a single production node.

Rendering is scheduled only when canvas state changes. Node drags update the selected
Pixi objects transiently and commit the document once when the drag ends, while the
dot grid is rendered as a repeating texture. Only nodes inside the viewport and a
small overscan area are mounted in the Pixi scene; detached displays are recycled
while panning. Adaptive text resolution therefore keeps labels sharp without
regenerating textures for off-screen nodes. Hit testing, marquee selection, and
visibility all use the same incrementally maintained spatial index. Undo history is
limited to 100 node-level operations rather than retaining entire document snapshots.

The active canvas is autosaved locally in IndexedDB and recovered when the app
reopens. Save updates the loaded named plan without opening a dialog. Save As creates
a new plan or explicitly overwrites an existing one after confirmation, while Manage
Plans is dedicated to opening and deleting browser-local plans. The app remembers
which named plan is currently loaded.
Resetting the canvas clears the canvas and undo history and detaches it from the
current named save without deleting any snapshots. Snap and performance settings are
retained in local storage. Imported files are validated against the current document
version. During this pre-release phase unsupported versions are rejected
intentionally; migrations will be added after the format stabilizes.

In development, append `?nodes=<count>` to create a deterministic load fixture. For
example, `?nodes=1000` starts the canvas with 1,000 nodes; counts are capped at 10,000
and fixture sessions do not overwrite the autosaved plan. The optional performance
bar reports active-render FPS, total and visible nodes, and average update/render
submission time. Hover a timing value to see its one-second-window p95 and maximum.
An FPS value of `0` means the canvas is correctly waiting because nothing needs
rendering.

For a repeatable worst-case browser benchmark, open `?nodes=10000`, then run this in
the browser console:

```js
window.satisfactoryBeltBenchmark();
```

It returns synchronous pan, zoom, marquee, and transient drag timings in milliseconds
and restores the fitted view when finished.

Choosing a recipe inserts its production machine at the last canvas cursor position
when opened with `N`, at the clicked position when opened from the context menu, or at
the viewport center when opened from the main menu. Choosing a machine first narrows
the picker to the recipes available for that machine. Resource extractors, logistics
buildings, and the AWESOME Sink can be added directly. Recipes with multiple ways to
produce their output expose a separate route button without changing the main
click-to-add action. On compact viewports the picker fills the available space and
does not open the software keyboard until the search field is selected.

## Contribution conventions

- Branches: `<type>/<short-description>`, for example `feat/infinite-canvas`
- Commits and pull requests: Conventional Commits, for example `feat(canvas): add pan and zoom controls`
