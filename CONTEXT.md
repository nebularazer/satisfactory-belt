# Factory planning

A factory plan describes machines and the materials exchanged between them.

## Language

**Machine group**:
One or more machines of the same type sharing a recipe or resource, represented
together with their combined material inputs and outputs. Each machine has its own
operating settings, including clock speed and amplification where supported.

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
