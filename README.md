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

- adding generic nodes from the menu or with `N`;
- selecting a node, Shift-clicking to toggle it, or dragging a marquee over nodes;
- dragging selected nodes, with fixed-grid snapping and an `Alt` bypass;
- panning with the middle mouse button or Space + primary drag;
- scrolling to zoom around the pointer;
- zooming with the floating controls or `+` and `-`;
- resetting the view with the zoom percentage or `0`;
- copying, pasting, and duplicating selections with the standard keyboard shortcuts;
- deleting selections with Delete or Backspace;
- undoing and redoing document changes from the controls or keyboard; and
- selecting light, system, or dark appearance from the canvas menu.

The grid uses a fixed 32-unit interval. Snap can be switched off in the menu without
changing the visual scale of the canvas.

## Contribution conventions

- Branches: `<type>/<short-description>`, for example `feat/infinite-canvas`
- Commits and pull requests: Conventional Commits, for example `feat(canvas): add pan and zoom controls`
