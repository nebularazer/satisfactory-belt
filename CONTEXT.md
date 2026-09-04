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
