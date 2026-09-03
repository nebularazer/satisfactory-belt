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

The first interaction slice supports:

- dragging the canvas to pan;
- scrolling to zoom around the pointer;
- zooming with the floating controls or `+` and `-`;
- resetting the view with the zoom percentage or `0`.
- selecting light, system, or dark appearance from the canvas menu.

Undo and redo are visible but disabled until the canvas has document mutations.

## Contribution conventions

- Branches: `<type>/<short-description>`, for example `feat/infinite-canvas`
- Commits and pull requests: Conventional Commits, for example `feat(canvas): add pan and zoom controls`
