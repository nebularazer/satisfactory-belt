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

The canvas interaction slice supports:

- opening a searchable node picker from the menu or with `N`;
- opening a contextual menu with right-click: add on empty canvas, duplicate/delete on nodes;
- selecting a node with primary click and moving it with primary drag;
- adding or removing nodes from the selection with Ctrl/Cmd + primary click;
- dragging a selection box with Ctrl/Cmd + primary drag;
- panning by dragging empty space, using the middle mouse button, or Space + primary drag;
- scrolling to zoom around the pointer;
- pinching to zoom and using two fingers to pan on touch screens;
- zooming with the floating controls or `+` and `-`;
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

The grid uses a fixed 32-unit interval. Snap can be switched off in the menu without
changing the visual scale of the canvas.

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

Choosing `Node` in the picker inserts it at the last canvas cursor position when
opened with `N`, at the clicked position when opened from the context menu, or at the
viewport center when opened from the main menu.

## Contribution conventions

- Branches: `<type>/<short-description>`, for example `feat/infinite-canvas`
- Commits and pull requests: Conventional Commits, for example `feat(canvas): add pan and zoom controls`
