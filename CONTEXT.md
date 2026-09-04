# Satisfactory Factory Planning

This context describes the game concepts represented by the factory planner and
its generated catalog.

## Language

**Recipe**:
An authored Satisfactory recipe with declared ingredients, products, duration,
and eligible Production Machines.
_Avoid_: Process, formula

**Production Process**:
A graphable transformation or capability, including authored Recipes as well as
extraction, power generation, resource wells, and other machine behavior.
_Avoid_: Synthetic recipe, fake recipe

**Consumption Process**:
A Production Process that accepts material without producing material, such as
the AWESOME Sink. Its resolved consumption rate depends on connected flow.
_Avoid_: Sink category, deletion

**Buildable**:
A placeable game entity whose runtime class may expose one or more clearance
boxes and an aggregate spatial footprint.
_Avoid_: Building, machine

**Buildable Category**:
A player-facing grouping used by Satisfactory's Build Menu, such as Production,
Power, Logistics, Transport, Organization, Special, and Architecture. It
organizes Buildables but does not define their production behavior.
_Avoid_: Node type, Process kind

**Production Machine**:
A Buildable that produces, extracts, consumes, or converts factory resources or
power.
_Avoid_: Producer

**Power Generator**:
A Production Machine that converts fuel or a geothermal resource into power;
its power is represented by a Power Profile rather than a material output.
_Avoid_: Power producer, generator Recipe

**Clock Speed**:
The configured operating rate of a Production Machine relative to its nominal
rate, affecting its material rates and Power Profile.
_Avoid_: Utilization, machine-equivalent

**Production Amplification**:
The output multiplier configured on a compatible Production Machine by
installing Somersloops, affecting its product rates and Power Profile without
increasing its ingredient rates.
_Avoid_: Sloop boost, output clock speed

**Resource Purity**:
The Impure, Normal, or Pure grade of a resource node or well satellite, which
scales the material rate of its assigned extractor.
_Avoid_: Resource quality, extractor efficiency

**Resource Well**:
A coordinated extraction capability consisting of one Resource Well
Pressurizer and one or more Resource Well Extractors on its satellites. The
Pressurizer's Clock Speed scales the well's extraction rates and Power Profile.
_Avoid_: Independent Resource Well Extractor, fluid node

**Machine Allocation**:
A whole-number set of Production Machine instances and their individual Clock
Speeds, Production Amplification settings, and Resource Purities where
applicable, assigned to a Production Process to satisfy a target throughput.
_Avoid_: Machine count, fractional machine count

**Descriptor**:
The stable game identity and metadata for an item, fluid, gas, Buildable, or
vehicle referenced by Recipes.
_Avoid_: Item when referring to non-item descriptors

**Clearance**:
The hard and soft spatial boxes used by the build hologram, including their
transforms and aggregate bounds.
_Avoid_: Hitbox, dimensions

**Planning Request**:
A requested output Descriptor and target rate used to generate a starting Plan.
_Avoid_: Live constraint, Node setting

**Plan**:
An editable factory model whose calculated material rates and Power Profiles
reflect its current Nodes and their configuration.
_Avoid_: Static snapshot, calculation

**Node**:
A planned factory element. In Basic Mode it may summarize a Machine Allocation;
in Detailed and Layout Modes it represents one Buildable instance.
_Avoid_: Buildable, graph vertex

**Material Port**:
A logical input, output, or bidirectional endpoint on a Node, constrained by
material form and optionally a Descriptor, but independent of any connection.
_Avoid_: Edge, physical connector, material rate

**Material Profile**:
The material input and output rates of a Node. It is calculated directly when
the Node's configuration determines its rates and connection-dependent
otherwise.
_Avoid_: Material Port, recipe ingredients

**Router**:
A Node that redistributes material without producing or intentionally storing
it, such as a Conveyor Splitter, Conveyor Merger, or Pipeline Junction.
_Avoid_: Logistics category, transport

**Buffer**:
A Node that intentionally stores material between flows, such as a Storage
Container or Fluid Buffer.
_Avoid_: Router, inventory slot

**Transport**:
A Node that transfers material between remote locations using vehicles, trains,
or drones.
_Avoid_: Logistics category, belt, pipe

**Basic Mode**:
A logical production graph that may summarize a Machine Allocation as one Node
with aggregate material rates and a Power Profile.
_Avoid_: Physical plan

**Detailed Mode**:
A factory plan that represents every required Buildable instance and its belt,
pipe, and routing infrastructure explicitly, without using spatial footprints.
_Avoid_: Basic Mode, Layout Mode

**Layout Mode**:
A Detailed Mode factory plan that uses actual Buildable footprints to represent
the factory's spatial requirements.
_Avoid_: Floor plan

**Power Profile**:
The power a Node consumes or produces, reported separately from its material
inputs and outputs.
_Avoid_: Power flow, power connection
