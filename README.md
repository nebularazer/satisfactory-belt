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

Choosing `Node` in the picker inserts it at the last canvas cursor position when
opened with `N`, or at the viewport center when opened from the menu.

## Contribution conventions

- Branches: `<type>/<short-description>`, for example `feat/infinite-canvas`
- Commits and pull requests: Conventional Commits, for example `feat(canvas): add pan and zoom controls`
