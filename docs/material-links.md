# Material links

## Scope

This branch implements connections between machine groups. Each input or output
can have multiple links; splitter and merger nodes are optional. Material rates,
allocation, balancing, belt tiers and individual-machine planning are deferred.
Suggested future mode names remain Flow plan and Build plan.

## Canvas interaction

- Tap a port, then a compatible counterpart, or drag between them to create one undoable link.
- Port dragging previews the route and snaps to a single compatible target. Empty,
  invalid, or ambiguous drops cancel; Escape, pointer cancellation, and a second
  touch also cancel. Small movements remain taps; ambiguous source ports retain
  the tap chooser and pan on swipes.
- Invalid targets cannot create links. Hovering an invalid opposite-direction
  port shows a `not-allowed` cursor; attempts retain the anchor without a red
  outline or error card.
- Links have no arrows. Their stroke stays two screen pixels wide across zoom
  levels, increasing to three pixels with the selection color when selected.
- Selecting a link exposes draggable interior segments. The existing central
  gesture coordinator handles taps, pans, segment movement and pinch cancellation.
- Ambiguous overlapping links use a temporary chooser. There is no material
  inspector card or inspector menu entry.
- Delete/Backspace removes the selected link. Deleting nodes also removes their
  incident links in the same history entry.
- Copy/paste includes links whose two endpoint nodes are copied, remapping IDs
  and translating manual route adjustments. Each segment drag is one undo step.

## Materials and sushi belts

Store stable link IDs and output/input port references. Derive the material set
from connected sources instead of storing a separate editable link material.
Require existing ports on different nodes, opposite directions and matching
transport. Concrete machine ports require their specific material. Reject
repeated endpoint pairs; allow feedback cycles across nodes.

Track possible materials in the direction of flow:

- A merger input carries its own upstream materials. The output combines the
  material sets of every input, so different materials can form a sushi belt.
- A normal splitter forwards every possible incoming material to each output.
  No output is assumed to filter materials based on ordering or timing.
- A mixed output may connect to another merger or a normal splitter, but cannot
  connect to a concrete machine input.
- Adding an upstream link is also checked against existing downstream machine
  inputs. Reject an addition that would turn their supply into a wrong or mixed
  material stream; leave the existing document unchanged.
- Empty logistics networks remain unassigned until sources are connected.
  Material requirements at machine inputs do not propagate backwards.
- Recompute material sets after disconnecting. Propagation stops at machine
  inputs and never crosses a recipe into its products.

Normal splitters distribute across available outputs and skip backed-up outputs.
A deliberately sequenced belt is not a reliable material filter for this
connections-only model. Smart splitters have an item/filter setting per output;
programmable splitters permit multiple filters per output.
[Splitter behavior](https://satisfactory.wiki.gg/wiki/Conveyor_Splitter).

### Sink and configurable splitter logic

AWESOME Sink, Smart Splitter and Programmable Splitter are supported in the domain
and prepared catalog. No splitter programming interface is included; that belongs
to the inspector phase.

- Sink nodes have one belt input, no material output and grouped power consumption.
  Every possible incoming item must be sinkable. Item sinkability comes from game
  data, with Alien DNA Capsules handled as a separate research-points exception.
  One-time coupon unlocks are not considered continuously sinkable streams.
  [DNA Sink behavior](https://satisfactory.wiki.gg/wiki/Alien_DNA_Capsule).
- Splitter programs store rules for stable `output:0`, `output:1` and `output:2`
  slots. The default is None / Any / None, with the center output open.
- Smart splitters accept one rule per output. Programmable splitters accept
  multiple rules, up to 64 total. Unknown materials, fluids, duplicate rules and
  invalid output slots are rejected.
- Supported rules are Item, Any, None, Any undefined and Overflow. Any undefined
  excludes items explicitly named anywhere in the program. Overflow can carry any
  incoming item when other outputs back up, so its possible-material set remains
  conservative without rate/capacity simulation.
- Material propagation applies the rules on each branch before validating
  downstream machine or Sink inputs. Disabled outputs cannot connect. Mixed
  material can feed a specific-item filter and safely leave as a single material.
- `setSplitterProgram` is an editor command for future inspector integration.
  Programs survive copy/paste and undo/redo. Changing rules reconciles invalid
  links in the same history entry, as other node configuration changes do.

Assets were prepared from `.assets/extracted/en-US-fm8YO8` and staged from
`.assets/prepared/en-US-syYb6V`, including both configurable splitter icons.

## Routing

The pure router keeps node positions fixed. It compares centered, horizontal-first,
vertical-first and gap routes by length before expanding obstacle detours. Equal
lengths retain the centered default. Endpoint stubs shorten for close neighbors.
The detour search is capped at 256 attempts per affected route; if no clear path is
found within that budget, a deterministic orthogonal fallback can cross cards.

Manual adjustments store axis-position guides. Keep endpoint stubs separate from
the editable interior when simplifying a route: combining them previously removed
outer segment handles after moving the middle handle. Repeated middle-segment
adjustments now retain all three editable segments. Moving one endpoint reconnects
to the guides; moving both endpoints together translates them. Deliberate manual
paths may cross cards.

Cache routes across camera changes and unaffected node movement. Drag previews
update affected links and are reused across subscribers. Route-only changes reuse
the material index. Pixi draws rounded paths below cards and culls by route bounds,
including paths crossing the viewport with both endpoints offscreen.

## Package ownership

- `factory-core`: document/link types and directed material validation.
- Factory editor: atomic edits, history, clipboard and route caching.
- `canvas-core`: orthogonal geometry, hit testing and gestures.
- `canvas-pixi`: border-matched path and handle rendering.
- Web app: temporary overlapping-hit chooser.

## Validation

Focused tests cover many-to-many links, mixed merger inputs, downstream clog
prevention, splitter propagation, recycling loops, disconnection, node/edge
history, clipboard remapping, forbidden cursors, gesture cancellation, route
culling, short paths and persistent segment handles. Formatting, lint, types and
the production build are checked as well.

Browser visual QA and real-device touch QA remain unverified: the browser runtime
reported no available browser in this session.
