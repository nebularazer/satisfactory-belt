# Machine node design

Implemented on `feat/machine-node-design`. This step replaces the
example rectangles with game machine cards and draws their material ports.
Connection creation, routing, throughput solving, recipe editing and machine
configuration controls are outside this step.

## What the repository already provides

- `canvas-core` owns selection, movement, snapping and camera geometry. The visible
  grid is 32 world units; movement snaps to 16 world units.
- `canvas-pixi` draws rectangles and text using WebGL, culls offscreen items and
  renders on demand. Keep these behaviors.
- `game-data` contains machine, recipe, item and icon-manifest types. Prepared
  catalogs and WebP icons live under `.assets/prepared/` and are served through
  the explicit staging command below.
- The inspected complete preparation, `en-US-GPakRv`, contains 291 recipes, with
  at most **four ingredients and two products**. Four is a per-side layout limit,
  not a total-port limit. Excited Photonic Matter has zero inputs.
- Resource extraction is modeled separately from manufacturing recipes. The catalog
  includes Miner Mk.1–3, Water Extractor and Oil Extractor, alongside the Gift Tree.
  Power generators remain outside this step.

## Proposed geometry

Use world units throughout; at 100% zoom, one world unit is one CSS pixel.

| Element                 | Size or position                             |
| ----------------------- | -------------------------------------------- |
| Every buildable card    | 256 × 256; eight 32-unit grid cells per side |
| Header                  | y = 0–64                                     |
| Body                    | y = 64–224                                   |
| Footer                  | y = 224–256                                  |
| Horizontal text padding | 16                                           |
| Input port centers      | x = 0                                        |
| Output port centers     | x = 256                                      |
| Belt port marker        | Circle, radius 7, centered on the card edge  |
| Pipe port marker        | Diamond, 18 × 18, centered on the card edge  |
| Material icons          | 24 × 24; centers at x = 28 or x = 228        |
| Maximum port slots      | Four on each side, spaced 32 units apart     |

Center each side's ports independently using this explicit table:

| Ports on that side | Local y coordinates |
| ------------------ | ------------------- |
| 0                  | None                |
| 1                  | 144                 |
| 2                  | 128, 160            |
| 3                  | 112, 144, 176       |
| 4                  | 96, 128, 160, 192   |

All anchors are multiples of the existing 16-unit snap size. A snapped card origin
therefore puts every anchor on the snapping lattice. Some anchors fall between
the visible 32-unit dots; that is consistent with today's movement behavior.
Turning snapping off permits arbitrary world positions, as it does today.

Keep the footer's space reserved when it has nothing to display. Card size and
port coordinates must not change with metadata, title length or selection. Use
subtle rounded corners, a white surface, muted separators and the existing purple
selection outline. Avoid heavy shadows and decorative machine backgrounds.

Conceptual layout (not to scale; bracketed words stand for icons):

```text
  ┌──────────────────────────────────┐
  │ [Machine] Reinforced Iron Plate  │
  │ 3× Assembler                     │
  ├──────────────────────────────────┤
  │                                  │
  ● [Iron Plate]                     │
  │           [Reinforced Iron Plate] ●
  ● [Screw]                          │
  │                                  │
  ├──────────────────────────────────┤
  │ [Zap] 45 MW  [Clock] 100%  [S] 0/2│
  └──────────────────────────────────┘
```

The 45 MW example is three 15 MW Assemblers at 100% clock with no Sloops.

## Content rules

**Header.** Show the catalog recipe name as the title and `3× Assembler` as the
subtitle, with a 40 × 40 machine image on the left. Keep the catalog machine name unchanged after the count. Use a single
title line with ellipsis at 15px, with a 12px muted subtitle. Reserve
space rather than shrinking fonts for long names. A fixed producer uses its
building name as the title because it has no selected recipe.

**Ports.** Draw one input per recipe ingredient and one output per product,
including byproducts. These are aggregated material ports, not replicas of every
physical conveyor or pipe socket on each building. Three Assemblers still have
the recipe's two inputs and one output. Preserve catalog order; do not sort by
localized names. Draw icons inside the card immediately beside the edge markers.
Empty sides have no dummy ports. Port markers are decorative in this step; they
do not start a connection or introduce a separate click action.

Inputs use warm orange (`#d77732`) with a pale orange fill; outputs use teal green
(`#239c83`) with a pale green fill. This follows the game's
[orange input / green output convention](https://satisfactory.gamecore.wiki/en/buildings/conveyor-belts/),
with shades selected for the white canvas cards. Circles identify belt ports;
diamonds identify pipe ports for both liquids and gases. Shape depends on item
form, so packaged fluids still use belt ports. Diamonds occupy slightly more
width than circles to give both shapes similar visual weight. Their tips are
included in viewport culling.

**Footer.** Use Lucide SVG paths for `Zap` and `Clock`, and the prepared game
Somersloop icon (`Desc_WAT1_C`) for the Sloop indicator. Show total group power in
MW and one common clock percentage. Show Sloops as `used/slots` **per machine**:
`3× Assembler` with `1/2` means one Sloop in each of three Assemblers (three of six
available slots across the group). Hide clock or Sloop fields when unsupported. A known zero
power value is `0 MW`; unknown power is `— MW`; variable power is explicitly
`Variable` until a verified range or average is available. Never render the
variable machine's zero base value as zero operating consumption.

The power icon uses gold (`#cd921a` stroke, `#f7ce65` fill); the clock uses cyan
(`#3299b5` stroke, pale blue face). Both are 16px, balancing the colorful Somersloop
image while keeping numeric labels neutral.

**Extractors.** Use the resource name as the title and the machine name/count as
the subtitle, with the extractor's game image in the header. An extractor has one
output and no material inputs or Sloop field. Its resource must be allowed by the
extracted game data. Power and clock apply to the whole group and shared machine
configuration respectively. Extraction rates and resource purity are not calculated
in this drawing step.

For this drawing step, all machines in a group share the recipe, clock and Sloop
configuration. Use a positive integer count. Mixed configurations would make a
single clock percentage misleading and need a separate design later.

## How to build it

1. **Expose the prepared assets to the app.** Add an explicit local staging command
   taking a completed preparation directory. Validate catalog/icon references and
   stage `catalog.json`, `icons.json` and referenced WebP files into a gitignored
   `apps/web/public/game-data/` directory. Load using the app's base URL so a
   subpath deployment works. Document the command here. Do not download the game
   during development or builds. Missing data should give a useful setup message;
   a missing individual texture should show a neutral placeholder without hiding
   its port. The prepared directory name above is an inspected example, not a
   hardcoded runtime path.

2. **Introduce the machine-node model in a small domain package.** Create
   `packages/factory-core`, depending on `game-data`, for immutable node records
   and a pure function that resolves display content. A manufacturing node stores
   `id`, `x`, `y`, `machineId`, `recipeId`, `machineCount`, `clockPercent` and per-machine `sloopsUsed`.
   Fixed producers and extractors are separate discriminated variants. An extractor
   stores `extractorId`, `resourceId`, count and clock alongside its position. Derive
   names, icons and materials from catalog references. Reject a recipe assigned to
   an incompatible machine. Represent known, unknown and variable power explicitly.
   The renderer receives display-ready values; it does not calculate game rules.

3. **Keep interaction geometry independent of game data.** Remove the required
   `text` field from `CanvasItem`; the controller needs only `id` and bounds.
   Adapt domain nodes into fixed-size canvas items in the host. Put the shared
   card dimensions and pure port-layout function in a small module in
   `factory-core`; import the existing grid constants for alignment. Do not add
   recipe lookup, port hit testing or connection state to `CanvasController`.
   Give each port a stable local key such as `input:<itemId>`; its eventual global
   identity also includes the node ID. Port identities must not depend on rows.

4. **Resolve footer values outside Pixi.** Preparation retains clock capability,
   Sloop slots, base boost, boost per Sloop, and both power exponents. A disabled
   amplification capability means zero slots; otherwise an explicit slot override
   is honored, with one slot for machines using the default. The Smelter's raw
   non-overridden zero is therefore not treated as an unsupported machine.
   Fixed machine group power is `count × baseMW × (clock / 100)^clockExponent ×
(baseBoost + used × boostPerSloop)^boostPowerExponent`. This assumes normal game
   settings and continuous operation, without world-level power modifiers. It
   follows the manufacturing calculation in [Satisfactory Calculator's source](https://github.com/AnthorNet/SC-InteractiveMap/blob/master/src/BaseLayout/Tooltip.js).
   Variable-power machines remain explicitly labeled `Variable`; cycle simulation
   and recipe-specific ranges are deferred.

5. **Extract a dedicated Pixi machine view.** Move card drawing out of
   `canvas-pixi/src/index.ts` into `machine-node.ts`. Supply resolved node display
   data and an icon resolver from the host alongside controller geometry, keeping
   both projections synchronized from the same document revision. Compose each
   view from a container, background/separators, header text, port markers,
   material sprites and footer labels/icons. Apply selection styling independently
   of content. Ellipsize labels and allocate bounded footer groups; long numbers
   must not overlap neighboring indicators.

6. **Preserve rendering performance.** Reuse textures by icon ID and size; start
   with 64px variants for 24px material icons. Fetch larger variants only when
   zoom/DPR warrants them. Reuse in-flight loads and invalidate once they finish.
   Change positions during drag/pan without rebuilding content. Keep demand-driven
   rendering, viewport culling and bucketed text resolution. Include protruding
   port markers in visual culling bounds. Destroy view objects on deletion but
   retain shared textures until their owning cache is disposed. Ignore stale
   texture completions after a view or canvas is destroyed. Do not add a ticker
   or one DOM element per port.

7. **Replace the demo and preserve editing.** Adapt `createExampleCanvas` to store
   domain nodes in edit history and provide geometry/display projections. Update
   copy/paste to clone all node configuration while assigning a new node ID;
   today's implementation copies rectangle fields individually. Keep deletion,
   dragging, keyboard movement, selection and undo/redo working. Seed real catalog
   examples covering Iron Plate, Reinforced Iron Plate (`3× Assembler`), Plastic
   (two outputs), Supercomputer (four inputs), Alien Power Matrix (four inputs and
   two outputs), Excited Photonic Matter (zero inputs), and Gift Tree (no clock).
   The examples use `0/1` on the Constructor, `1/2` on each of three Assemblers,
   and `2/2` on the Refinery, with computed fixed power.

8. **Verify the meaningful boundaries.** Add focused tests for the port table,
   world-grid alignment, catalog resolution/byproducts, invalid machine/recipe
   pairs, capability extraction, and metadata surviving paste and undo/redo.
   Check in the browser at 50%, 100% and 200% zoom, plus the existing zoom limits:
   icons load, no labels overlap, ports remain attached while moving, and selection
   stays legible. Exercise a missing texture, long title and large power label.
   Compare a temporary repeated-node scene using the existing performance monitor,
   including idle rendering and repeated pan/zoom. Run formatting, lint, types,
   relevant tests and the web build after implementation.

## Suggestions beyond the requested drawing

These are recommendations to choose from, not additional implementation scope:

- **Full names in the planned inspector.** Show untruncated node, recipe and
  material names in the inspector with touch and keyboard access. Do not add
  full-name hover tooltips to the nodes.
- **Rates beside materials.** Reserve the empty space inward of each icon for a
  future `30/min` or `60 m³/min`. Add rates when the calculation model exists.
- **An alternate-recipe badge.** The catalog already marks alternates. A small
  `Alt` badge would be easier to scan than a long title prefix.
- **Zoom-dependent detail.** If profiling shows a benefit, hide footer text and
  secondary detail when cards become too small to read. Keep card and anchor
  geometry unchanged.
- **Clarify the visible grid.** Keep the current 16-unit snapping for this step.
  If every port must sit on a visible dot, expose minor dots at useful zoom levels
  or revise both the anchor table and node-origin snapping together. Merely making
  the card 256 units wide does not guarantee visible-dot alignment.

The initial recommendation is the 256-unit card and four slots per side above,
with a shared configuration per machine group. Validate that size visually using
the densest recipe before adding more body content.

## Running this implementation

Prepare assets again if your previous catalog predates the logistics definitions,
then stage the completed output directory printed by preparation:

```bash
pnpm assets:prepare --input .assets/extracted/en-US-WSmSpy
pnpm assets:stage --input .assets/prepared/REPLACE_WITH_COMPLETED_RUN
pnpm dev
```

The latest local run is `.assets/prepared/en-US-9lQx5t`, including logistics images. Staging
checks catalog references and every icon file's size and hash before replacing the
previous browser assets. Staged assets are gitignored; stage them before a build
that needs to include the game catalog and icons. No Steam access is needed for
preparation or staging. Runtime URLs respect Vite's base path.

`factory-core` resolves cards and port geometry; `canvas-core` handles rectangular
interaction bounds; `canvas-pixi` owns machine views and their shared icon cache;
`example-canvas` owns the editable document and publishes geometry and card content
together. Copy/paste retains all machine settings. Ports remain decorative.

## Validation

### Compact logistics additions

Conveyor Splitter and Conveyor Merger render as body-only 128 × 128 squares.
The game image is centered at 64 × 64 with 70% opacity. Their belt ports retain
the machine port size and colors, with three slots at 32, 64 and 96 units on
the multi-port side and one centered opposite port. Each has four total ports.

The catalog's `logistics` entries supply names, images and splitter/merger kinds.
Logistics nodes use stable slot keys and null material/icon IDs until connections
provide material information. `resolveFactoryNode` projects either node layout;
mixed-size bounds flow through the existing canvas editing and renderer.
The demo includes one splitter and one merger alongside the 12 machine examples.
Pipe junctions remain future link geometry, without standalone nodes.

The logistics update passed 64 relevant tests, formatting, lint, type checking
and the production build. Chromium inspection covered all 14 cards, logistics
dragging, clipboard, deletion, undo and zoom changes with no page or asset errors.
The canvas returned to zero idle renders. Assets were prepared and staged from
`.assets/prepared/en-US-9lQx5t` (211 unique images).

### Machine validation

- The initial implementation passed 94 focused tests for geometry, document editing, rendering performance
  accounting, game data, catalog extraction and asset staging.
- Formatting, lint, type checking and production build passed. Vite still reports
  a large main bundle; bundle splitting was outside this node drawing change.
- Chromium browser checks passed for drag snapping, Control/Command copy and paste,
  undo/redo, zoom at 50%, 100%, 200%, 10% and 800%, long labels, and missing icons.
  A `/planner/` base path and the missing-catalog setup message were also checked.
- The card image before and after forced WebGL context loss/restoration was identical.
- A temporary 1,000-card scene retained 20 visible cards at the tested viewport and
  returned to zero renders per second when idle. Browser checks used SwiftShader;
  these establish behavior, not hardware GPU performance targets.
- The port-color and extractor update passed 58 relevant tests, including liquid/gas
  transport classification, extraction restrictions, validation, and extractor
  copy/paste and undo/redo. Browser inspection covered all 12 cards, colored circle
  and diamond ports, footer colors, mixed solids/water/nitrogen in Cooling System,
  and iron, copper, water and oil extraction, with no page or asset errors.
