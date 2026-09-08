# Logistics layout design study — throwaway prototype

Question: can production stages, dedicated logistics areas and a separate return lane make a Detailed factory readable while keeping identical recipes grouped?

This branch is a review artifact, not a replacement auto-layout implementation. Layout selection is pending user review.

## Run

From this prototype checkout:

```sh
pnpm prototype:logistics
```

The dev-only view opens on the existing app route:

- [A — Stage corridors](http://127.0.0.1:4174/?prototype=logistics&variant=A): the whole factory, individual machines grouped by recipe, logistics summarized between stages.
- [B — Material lanes](http://127.0.0.1:4174/?prototype=logistics&variant=B): a comparison of material supply, logistics and receiving recipes.
- [C — Stage focus](http://127.0.0.1:4174/?prototype=logistics&variant=C): the complete Iron Rod logistics area with every machine, router and belt visible.

Use the floating switcher or left/right keys to compare variants. URLs preserve the selected variant on reload. Selecting Iron Rod logistics in A opens C; other materials open their summary in B. Scroll horizontally on small screens.

## Data and scope

The prototype calls the existing Auto-build and Detailed conversion functions for 10 Modular Frames/min, pinned Cast Screws, Mk.1 conveyors and Mk.2 pipelines. The generated factory has 33 machines, 47 routers and 108 material links.

C shows the real Iron Rod subnetwork: four constructors, five assemblers, ten routers and 21 belts. Its 12/min return enters a splitter and rejoins through three 4/min feeds. All four return connections are dashed. Their identities and node positions are hand-authored for this fixture; they are not a general cycle classifier or layout algorithm. Other material networks are summarized in A and B, not fully expanded.

The dashed style is the candidate under review. Confirmed requirements are **no feedback arrows** and **preserve capacity coloring**. Forward and return links use the same existing material-flow palette. The explicit color-preview selector changes only the visual preview; rates and capacities stay untouched.

No plan is loaded from or written to storage. The regular application and production auto-layout stay unchanged. The prototype is gated to development and isolated on `feat/logistics-layout-prototype`.

## Review artifacts

- [Factory overview](overview.png)
- [Material lanes](material-lanes.png)
- [Complete rod logistics](rod-logistics.png)
- [Overloaded-color preview](feedback-overloaded.png)

Browser review checked variant navigation, keyboard switching, reload-stable URLs, belt selection, zero arrow markers, four dashed plus seventeen solid links, identical status colors for both styles, and no IndexedDB databases created. A 390px viewport keeps the diagram scrollable without widening the page. TypeScript validation passed; no prototype test suite was added.

Next decision: judge whether the overview structure in A and the expanded spacing in C should inform a single zoomable canvas. B is an alternative organization to compare, not a proposed extra required planning mode. A full-factory expanded layout still needs evaluation before implementation.
