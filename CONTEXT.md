# Factory planning

A factory plan describes machines and the materials exchanged between them.

## Language

**Machine group**:
One or more machines of the same type sharing a recipe or resource, represented
together with their combined material inputs and outputs. Each machine has its own
operating settings, including clock speed and amplification where supported.
Stations, logistics buffers and the Space Elevator are individual buildings; they
cannot form machine groups.

**Group member**:
An individual machine within a machine group, retaining its identity when its
operating settings change.

**Mixed setting**:
An operating setting whose value differs between members of a machine group.
Editing that setting for All assigns the chosen value to every member.

**Material port**:
A machine group's input for one ingredient or output for one product. It represents
the combined material stream of the group.

**Material link**:
A directed connection from a material output to an input that accepts its stream.
Multiple links may share a machine group's input or output port.

**Material stream**:
The set of materials that can travel through a material link. A merger combines
its incoming streams; an ordinary splitter distributes the incoming stream
without filtering its materials.

**Sushi belt**:
A belt carrying more than one material. It needs material filtering before it
can supply a machine port that requires a single material.

**Splitter program**:
The material-selection rules assigned to each output of a smart or programmable
splitter. Smart splitters have one rule per output; programmable splitters allow
multiple rules.

**Sinkable material**:
A material the AWESOME Sink can consume continuously. A mixed stream is sinkable
only when all of its possible materials are sinkable.

**Resource purity**:
The yield class of an individual extraction site: impure, normal, or pure.
Sites in one machine group may have different purities while sharing their resource.

**Resource well**:
A pressurizer and its satellite extractors, sharing one resource and pressurizer
clock. Grouped wells share the resource; each member has its own clock and counts
of impure, normal, and pure satellites. Only pressurizers consume power.

**Transport route**:
A directed loop of compatible vehicle, train, or drone stations. A route can have
intermediate stops for vehicles and trains; drones make two-port round trips.
An open chain is an incomplete route. Fleet and round-trip
assumptions belong to the route.

**Configured supply**:
The nominal material supply implied by machine settings along an unambiguous
path. It does not account for transport capacity, demand, or allocation between branches.

**Route port**:
A station’s arrival or departure point connecting it to other stations of the same
transport type. It carries a route relationship, not a material stream.

**Freight-car position**:
A numbered car in the train shared by a rail route. Each station configures that
position as a solid freight platform, a fluid freight platform, or no transfer.
Platforms belong to their station and expose its cargo inputs or outputs; they
are not separate nodes.

**Fuel port**:
A material input reserved for transport fuel, distinct from cargo inputs.

**Project Assembly sink**:
A Space Elevator accepting the parts for a selected phase without a delivery limit
in the factory plan. A world has only one Space Elevator.

**Flow plan**:
A production plan whose nodes represent machine groups and whose material links
share supply without requiring physical logistics or transport capacities.

**External supply**:
A declared continuous material input from outside the planned factory, assigned to
a material input at a specified rate.

**Export**:
A declared continuous material output leaving the planned factory at a specified
rate. Finite storage alone is not an export.

**Configured-rate feasibility**:
Whether the connected plan can sustain all configured production, declared supply
and exports simultaneously. It does not establish startup feasibility.

**Feasible allocation**:
One distribution of material across links satisfying the configured rates and
material conservation; it is not a prediction of machine starvation or timing.

**Planned allocation**:
A distribution of configured production across connected material ports. Partial
allocations remain inspectable in unfinished plans. Recipe outputs are configured
potential, not predicted actual throughput under ingredient shortages. Configured
counts stay fixed during allocation. Connected placement initially sizes a group
to the anchor port’s remaining supply or demand, preferring uniform underclocking.
Sizing is calculated simultaneously from output targets and preferred clocks,
independent of construction order. An unlocked operating edit holds that group's
settings for the current solve without saving a target. Targets describe gross output;
connected consumers use that output, and an unconnected target is the final product.
Automatic suppliers meet combined demand, including extraction and recycling loops.
Finite extractors expose available supply; automatic downstream groups use it.
Unlocked count edits keep clock speed; unlocked clock edits keep count. Both change
output. Locked count edits preserve output by adjusting clock within 1–250% and
save a preferred clock, never a count limit. Later demand changes resize the group
using that clock, underclocking as needed to balance whole counts. Standalone recipes
and extractors start unlocked. Terminal production provides demand for automatic
suppliers when no locked supply feeds it; these requirements are derived, never saved
as hidden locks.
Shortages remain visible instead of overriding constraints. Storage only collects
surplus. The inspector has one production-rate lock for the entire recipe: editing
one output locks it and updates coproducts by recipe ratio; unlocking removes the
target and displays the calculated rates. Operating edits never create a production
lock; their settings take precedence for the current solve only. Link text has a constant canvas-space font size and scales with zoom.

Clock speed shows the actual group clock. Unlocked +/− changes it by one percentage
point. When locked, − adds a machine and lowers the clock; + removes a machine and
raises it. Locked typed percentages are requests: whole counts and exact output
take precedence, so the displayed clock may adjust.
An info tooltip explains this with an example. Rebalance at 100% preserves output
and lock state while selecting whole machines without overclocking. Clock/rate
displays use common fractions or two decimals; editing uses full decimals without
committing formatting on focus/blur. Supply details are collapsed and neutral.
Link text render resolution follows zoom/display density to remain sharp.
