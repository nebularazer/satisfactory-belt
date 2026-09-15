# Port selection and compatible targets

Proposed next step after the machine-node design. Implement port selection,
touch handling and compatibility highlights first. Actual links, routing and
connection history belong to the subsequent connection step.

## Recommended interaction

Use **tap a port, then tap a compatible port** as the primary interaction for
both touch and mouse. Future connection dragging can be a shortcut. Selecting
either end is supported: selecting an output highlights receiving inputs;
selecting an input highlights outputs that can supply it. Material always flows
from output to input, regardless of which end was selected first.

In the selection step, tapping a compatible target selects a preview pair and
shows the selected endpoints in a small inspector. Keep this temporary preview
to existing highlights and a short target label, with no separate preview editor
or confirmation workflow. It does not create an edge or
pretend a connection has been made. Keep the original anchor selected until the
user clears it or chooses another anchor. Later, the connection command replaces
this preview action after validating the pair again.

| Action                                           | Result                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| Tap/click a port while idle                      | Select its node exclusively, select the port, highlight compatible targets |
| Tap the selected anchor again                    | Clear port selection and highlights; keep node selected                    |
| Tap a compatible target                          | Mark it as the preview target; keep anchor selected                        |
| Tap another compatible target                    | Replace the preview target                                                 |
| Tap another port on the anchor's side            | Switch the anchor to that port                                             |
| Tap an incompatible opposite-side port           | Keep the anchor; show a short reason on the attempted port                 |
| Tap empty canvas or the inspector's Clear button | Clear port selection; preserve the canvas's normal node-selection behavior |
| Tap another node's body                          | Clear port selection and select that node normally                         |
| Pan, scroll-zoom, or pinch after selection       | Keep anchor; update highlights at their new screen positions               |
| Start a node drag or marquee                     | Clear port mode and use the existing gesture                               |
| Escape                                           | Clear port mode first; a subsequent Escape uses normal canvas behavior     |

The inspector shows the material icon/name, input/output label, machine/recipe,
transport type, and compatible-target count. Show full, untruncated names here;
do not add full-name hover tooltips to the nodes. With no matches, say “No compatible
inputs” or “No compatible outputs”; selecting such a port is still valid.
Keep the inspector compact: selected-node port controls, selected-port details,
compatible-target count, preview-target label and Clear. Provide simple previous/next
node controls so keyboard users can reach another node's ports while retaining the
anchor. Defer machine search, global target browsing and automatic camera navigation.

## Touch targets and gesture ownership

Use each node's published bounds and existing port anchors and glyphs. Interaction
areas are measured in **CSS pixels**, independent of zoom and device pixel ratio:

- Mouse/pen: aim for a 24 × 24 minimum hit area around the port; never make the
  hit area smaller than its visible shape at high zoom.
- Touch: aim for a 44 × 44 minimum hit area around the port.
- Inspector, chooser, Clear and navigation controls: at least 48px high, with
  non-overlapping hit areas and comfortable horizontal padding.

W3C's enhanced target guidance uses 44 × 44 CSS pixels and explicitly notes that
overlapping areas do not count as independent target space. The inspector/chooser
provides large, unambiguous equivalent controls; an enlarged invisible canvas hit
area alone does not establish accessibility compliance.
[Target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

**Resolve collisions explicitly.** Transform visible anchors to screen coordinates,
including temporary node movement offsets. Ignore ports hidden beneath another
card, and do not let an expanded hit area reach through an overlapping card's
body. Collect candidates under the pointer:

1. One candidate: begin a pending port press.
2. Multiple candidates: on a completed tap, open one shared port chooser with
   48px rows, material icons and input/output + machine names. Do not guess based
   on array order or silently favor the compatible candidate.
3. No candidate: use normal canvas behavior. The selected node's port inspector
   remains an alternative way to select its ports.

At 100% zoom, port centers are only 32px apart; at 50% they are 16px apart. The
chooser must therefore be part of the first implementation. Use a flat scrollable
candidate list with node and port labels, including at low zoom. Defer grouped
browsing. The chooser is a popover on larger screens and a bottom sheet on narrow
screens, placed clear of the finger and device safe areas. Do not require a long
press, hover, or precision drag to complete any port operation.

**Commit selection on release.** A pointer-down shows a temporary pressed outline;
it does not select, move a node or select a target yet. A touch tap tolerates up
to 10px of movement (mouse/pen: the existing 4px threshold), without a short hold
timeout. Passing the threshold cancels port activation and pans from the original
pointer-down position; dragging from a port must not accidentally move its node.
Provide future connection dragging as a distinct mode using the same arbitration.

Every pointer must reach one central gesture coordinator. A second finger always
cancels an uncommitted port press and hands both pointers to pinch. If an anchor
was already selected before the pinch, preserve it. Once one pinch finger lifts,
wait for all fingers to lift before allowing a new tap. Pointer cancellation,
lost capture, blur and context loss clear pending presses and hover states;
destruction clears all port state. Preserve the existing committed anchor across
a simple blur, but revalidate it on return. A pointer sequence never commits both
a port action and a canvas gesture.

Tap-based operation also supplies an alternative to future dragging.
[Dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

## Highlight palette

Keep direction colors on the port itself. Interaction state uses a separate outer
outline, so an orange input remains visibly an input while highlighted as a target.
Circle and diamond shapes always retain their belt/pipe meaning.

| Role                                                 | Color                                               | Additional visual cue                                  |
| ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Input identity                                       | Existing `#d77732`, fill `#fff0df`                  | Left side                                              |
| Output identity                                      | Existing `#239c83`, fill `#e1f5ed`                  | Right side                                             |
| Hover / pending press                                | Slate `#64748b`                                     | Thin outer outline; details on hover or press          |
| Selected anchor                                      | Existing selection violet `#6960d9`, tint `#f0edff` | Double outline; inspector says “Selected input/output” |
| Compatible (“can connect”)                           | Blue `#2563eb`, tint `#eff6ff`                      | Dashed outer outline; listed under compatible targets  |
| Compatible target under pointer / chosen for preview | Deep blue `#1d4ed8`, tint `#dbeafe`                 | Solid thicker outline plus Lucide Check badge          |
| Incompatible, untouched                              | Existing direction colors                           | No compatibility outline                               |
| Attempted incompatible target                        | Red `#b91c1c`, tint `#fef2f2`                       | Lucide X badge and a textual reason                    |

Blue makes compatibility distinct from the existing teal output identity. This
avoids suggesting that every output is a valid target. Avoid coloring every
incompatible port red: an incompatible material is normal, not an error until
the user tries to pair it.

Calculated contrast against white is 4.91:1 for selection violet, 5.17:1 for
compatible blue, 6.70:1 for active-target blue, and 6.47:1 for attempted-invalid
red. Check the final rendered strokes against their actual surroundings as well.

Use roughly 2px screen-space outlines (3px for the active target), a 2px gap from
the base glyph, and solid opaque strokes with light tints behind them. The active
target's badge sits outside the port toward empty canvas, away from material
icons; include it in culling bounds. State priority is attempted-invalid, selected
anchor, active compatible target, compatible, hover, base. Keyboard focus adds a
separate focus indicator without hiding any semantic state.

At zoom levels where rings or badges would overlap, omit badges and show a thin
matching-node outline plus match count; retain individual markers where they fit.
The inspector's full-size port rows remain usable at every zoom. Highlights
are static, with no pulsing animation or permanent render loop.

Pair colors with outline patterns, symbols and text; verify contrast at normal
and reduced zoom. This follows [W3C's guidance on using color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

## Compatibility rules

Identify a port by `{ nodeId, portKey }`, using the existing keys such as
`input:Desc_Water_C`. Do not use array indices, icon IDs, localized names or screen
coordinates as identity.

Normalize a proposed pair into output → input, then require:

1. Both ports still exist and belong to different nodes.
2. Exactly one is an output and the other an input.
3. Both have the same `itemId`.
4. Both have the same transport type (`belt` or `pipe`).

For example, a Water Extractor output can target Cooling System's Water input.
It cannot target its Nitrogen Gas input, although both use pipes. An Iron Ore
output can target recipes consuming Iron Ore, but not Iron Ingot or Iron Plate.
Packaged Water is a separate solid item and uses a belt.

Count, clock speed, Sloops and power do not determine material compatibility.
Extractors and fixed producers follow the same output rules as manufacturing
nodes. Exclude connections within the same node for this initial design; do not
reject cycles spanning several nodes, since factory processes may recycle materials.

Return a reason alongside compatibility, for example `same-node`, `same-direction`,
`different-material`, `different-transport`, or `missing-port`. With no link model
yet, “can connect” means material and direction compatibility. Port occupancy,
duplicate links, split/merge rules and throughput constraints must be decided when
actual connections are introduced and validated again at connection commit time.

## Implementation sequence

1. **Domain rules in `factory-core`.** Add stable port references and a pure
   `getPortCompatibility(anchor, candidate)` result. Expose semantic port metadata
   independently of labels/styles. Index ports by item, transport and direction;
   rebuild when node configuration changes, not on pointer movement or camera
   changes. The host resolves IDs from the current document before evaluating.

2. **Selection state and gesture coordination in `canvas-core`.** Add transient
   anchor, preview target, hover, pending-press and chooser-candidate state. The
   controller receives generic port geometry and host-supplied compatibility
   results; it must not import recipes or other game rules. Extend the existing
   pointer coordinator so port presses and pinch share pointer tracking. Preserve
   modifiers for marquee and node multi-selection before considering port hits.
   Choose thresholds by each event's pointer type, supporting hybrid devices.

3. **Host integration.** Publish geometry, semantic ports and compatibility data
   from the same document revision. Clear missing anchors after deletion, undo,
   recipe/resource changes or document replacement; refresh remaining targets when
   other nodes change. Moving a node updates geometry without recomputing material
   compatibility. Selection and previews stay outside edit history and clipboard
   payloads. An unchanged stable port reference may survive a metadata edit.

4. **Pixi presentation.** Extract the direction and interaction colors into named
   palette tokens shared with DOM UI. Add a dedicated port-highlight layer to each
   visible node view, updated without rebuilding labels or textures. Central hit
   testing uses projected geometry and draw order; keep Pixi per-port event
   dispatch disabled. Recompute hover after camera movement even when a mouse
   pointer has not moved. Draw only visible highlights, including their extents
   in culling; invalidate only when visible state changes.

5. **Shared inspector and chooser in the web app.** Reuse one DOM panel, with
   accessible 48px rows for the inspected node's ports and ambiguous candidates.
   Provide simple keyboard-accessible previous/next node controls without changing
   the anchor, then roving focus through input/output rows. Enter/Space selects, Escape
   cancels, and Tab enters/leaves the controls normally. Announce material,
   direction, transport and compatibility reason. Do not intercept arrow keys
   as node movement while focus is inside these controls. Install any required
   shadcn primitives via its CLI. Keep preview UI to a target label and the
   existing highlights. Defer machine search, global target lists, automatic camera
   navigation and grouped candidate browsing; never create a DOM control for every
   port on the canvas.

6. **Focused verification.** Test the compatibility truth table, stable IDs,
   lifecycle after edits, and the gesture transitions below. Inspect desktop,
   mobile and hybrid pointer behavior at 10%, 50%, 100%, 200% and 800% zoom, with
   DPR 1 and 2. Verify a densely packed group and overlapping nodes. Browser
   automation can test pointer sequences, but also check finger occlusion and
   pinch behavior on a real touch device before calling touch support complete.

| Regression case                                            | Expected result                                 |
| ---------------------------------------------------------- | ----------------------------------------------- |
| Slight finger movement, then release                       | One port selection, no node move                |
| Swipe starting on a port                                   | Pan; no selection or preview-pair commit        |
| Second finger during a port press                          | Pinch; no accidental port activation on release |
| Ambiguous hit between adjacent ports                       | Chooser; no arbitrary target selected           |
| Port hidden beneath a node                                 | Not selectable through the covering card        |
| Pan/pinch after choosing a source                          | Source persists; highlights track camera        |
| Compatible and incompatible pipe materials                 | Only the same material is highlighted           |
| Delete/undo/change a source's recipe or extracted resource | Revalidate IDs and remove stale highlights      |
| Keyboard use inside inspector                              | Port navigation; no accidental node nudges      |
| Idle with many compatible targets                          | Zero recurring canvas renders                   |

Acceptance: a user can select a port, identify every compatible counterpart and
choose a preview target using taps alone, with reliable cancellation and no
accidental node movement. All meanings remain understandable without color.
