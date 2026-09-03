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

- opening a searchable node picker from the menu, with `N`, or by right-clicking;
- selecting a node with primary click and moving it with primary drag;
- adding or removing nodes from the selection with Ctrl/Cmd + primary click;
- dragging a selection box with Ctrl/Cmd + primary drag;
- panning by dragging empty space, using the middle mouse button, or Space + primary drag;
- scrolling to zoom around the pointer;
- zooming with the floating controls or `+` and `-`;
- resetting the view with the zoom percentage or `0`;
- copying, pasting, and duplicating selections with the standard keyboard shortcuts;
- deleting selections with Delete or Backspace;
- undoing and redoing document changes from the controls or keyboard;
- showing optional live canvas performance metrics from the Settings menu; and
- selecting light, system, or dark appearance from the canvas menu.

The grid uses a fixed 32-unit interval. Snap can be switched off in the menu without
changing the visual scale of the canvas.

Rendering is scheduled only when canvas state changes. Node drags update the selected
Pixi objects transiently and commit the document once when the drag ends, while the
dot grid is rendered as a repeating texture.

In development, append `?nodes=<count>` to create a deterministic load fixture. For
example, `?nodes=1000` starts the canvas with 1,000 nodes; counts are capped at 10,000.
The optional performance bar reports active-render FPS plus average update and render
submission time. Hover the timing values to see their p95 measurements. `idle` FPS
means the canvas is correctly waiting because nothing needs to be rendered.

Choosing `Node` in the picker inserts it at the last canvas cursor position when
opened with `N`, at the clicked position when opened by right-clicking, or at the
viewport center when opened from the menu.

## Contribution conventions

- Branches: `<type>/<short-description>`, for example `feat/infinite-canvas`
- Commits and pull requests: Conventional Commits, for example `feat(canvas): add pan and zoom controls`
