# Satisfactory Factory Planning

This context describes the game concepts represented by the factory planner and
its generated catalog.

## Language

**Recipe**:
An authored Satisfactory recipe with declared ingredients, products, duration,
and eligible producers.
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

**Descriptor**:
The stable game identity and metadata for an item, fluid, gas, Buildable, or
vehicle referenced by Recipes.
_Avoid_: Item when referring to non-item descriptors

**Clearance**:
The hard and soft spatial boxes used by the build hologram, including their
transforms and aggregate bounds.
_Avoid_: Hitbox, dimensions
