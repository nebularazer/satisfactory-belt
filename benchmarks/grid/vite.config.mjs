import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const candidate = process.env.GRID_WORKTREE ?? repository;
const grid = resolve(candidate, "packages/canvas-pixi/src/grid.ts");

export default ({ mode }) => ({
  root: here,
  base: `/${mode}/`,
  resolve: {
    alias: {
      "@benchmark/grid": existsSync(grid) ? grid : resolve(here, "legacy-grid.mjs"),
      "@benchmark/canvas": resolve(candidate, "packages/canvas-pixi/src/index.ts"),
      "@satisfactory-belt/canvas-core": resolve(candidate, "packages/canvas-core/src/index.ts"),
      "pixi.js": resolve(candidate, "packages/canvas-pixi/node_modules/pixi.js/lib/index.mjs"),
      "@fontsource-variable/inter": resolve(
        repository,
        "apps/web/node_modules/@fontsource-variable/inter",
      ),
    },
  },
  build: { outDir: resolve(repository, `.dev/grid-benchmark/${mode}`), emptyOutDir: true },
});
