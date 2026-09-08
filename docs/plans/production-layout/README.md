# Production stages and logistics areas

Auto-arrange and Detailed conversion use the same layout. Recipes form vertical
stacks; parallel steps occupy the same production stage. Physical logistics sit
between stages, aligned with their connected machine ports. The diagram stays on one editable canvas.
Group labels, outlines, header selection, and renaming are shown only in Detailed
mode; Basic mode shows its recipe cards directly.

These screenshots are from the actual browser conversion workflow: 10 Modular
Frames/min, Cast Screws, and Mk.1 belts.

![Complete factory with recipe columns and logistics areas](overview.png)

![Rod collection, distribution, and separate dashed return lanes](returns.png)

The larger Detailed fixture shows balancer branches aligned with the Cast Screw
constructors they feed. The last mergers connect straight into the machine
stack, without collecting those belts into a shared exit.

![Balancer branches feeding machines directly at their port heights](direct-feeds.png)

## Layout rules

- Group machines by recipe, preserving individual cards and machine port order.
- Two-way splitter outputs and merger inputs occupy the top and bottom slots,
  leaving the center unused. Generation and Auto-arrange set presentation order;
  actual port identities, smart rules, priorities, and rates stay unchanged.
- Group connected routers and parallel supply groups serving the same recipe
  port. Capacity limits still describe separate physical belts.
- Lay out individual routers together with fixed recipe stacks in one graph.
  Reserve layers for each production stage and its logistics depth, keeping
  parallel recipes aligned even when their balancers have different depths.
  Route directly between actual ports; no logistics boundary ports or joined
  internal/external routes funnel belts through a shared exit.
- Prefer short routes and local bends, allowing branches to leave at different
  heights near their consumers. Draw group outlines around clear areas of the
  resulting layout; omit a rectangle if it would enclose unrelated nodes.
- Identify cycles from topology, then recognize return distributors feeding
  parallel branches. Put routers serving only returns below the forward flow.
  Give return links separate lanes, rounded dashes, and the existing flow colors.
  Feeds leaving a return distributor travel horizontally at their port heights
  before turning toward their destinations. The main returning belt uses the
  outside lane below the group.
- Keep cycles between production recipes within a finite stage. Long forward
  bypasses stay solid even if their geometry travels leftward.
- Persist positions and routes through the existing save format. Feedback roles
  and default group labels are derived; custom names are saved. Editing a cycle updates its styling and
  manual moves cannot leave stale saved group boundaries.

The implementation changes presentation only. It does not replace belts,
rebalance rates, change machine clocks, or insert/remove physical routers.
Existing plans adopt it on their next Auto-arrange, which remains undoable.

## Group labels and selection

Group headers grow with the cards at high zoom, use up to two lines when space
allows, and truncate within the header width at overview zoom. Unreadable labels
hide at distant zoom; hovering a header reveals its full name. The same text
resolution scaling as node cards keeps close-up headers sharp.

Click a header to select its nodes and open the group inspector. Rename or reset
the group there; names persist in Basic and Detailed saves and through subsequent
Auto-arrange, with undo/redo support. Clicking a member card inspects that node;
dragging a selected member moves the group. Thin outlines mark group boundaries,
with a stronger outline for the selected group. Link strokes are thinner while
preserving their capacity colors, dashed return style, and click targets.

![Selecting and renaming a group](rename.png)

![Sharp, wrapped and truncated group labels at 301 percent zoom](labels-close.png)

Basic mode keeps the arranged cards and connections without group decorations.

![Basic factory without group labels or outlines](basic.png)

The mobile build toolbar uses a mode menu, Add node, and a menu with labeled
Splitter and Merger actions. It stays on one row at 320–412px widths.

![Single-row mobile build toolbar](mobile-toolbar.png)
