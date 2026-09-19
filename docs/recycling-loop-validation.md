# Recycling loop validation scenario

Source: user-supplied screenshot from the discussion of
[How I Plan Every Factory in Satisfactory](https://www.youtube.com/watch?v=66msi3n3vcE).
Exact frame timestamp is unknown. Recipe identities are inferred from the visible
materials and rates, then checked against the prepared repository catalog
`.assets/prepared/en-US-qCCgQg/catalog.json`. No video transcript was available.

## Canvas reference

`apps/web/src/lib/recycling-reference.ts` recreates this graph below the modular-frame
example, including both splitters and both storage destinations. Storage implicitly
collects surplus after recipe demand; no storage targets are declared. Crude oil is declared as 450/min external supply at the first refinery input.
Water uses twelve extractors at 100% and one at 50%.

Validated against the staged game catalog: all thirteen link rates match the screenshot,
the combined graph is feasible, storage collects 600 plastic and 750 rubber, and the
original modular-frame example still produces 20 per minute. Editing the separate modular-frame chain leaves the
recycling configuration unchanged. This verifies configured steady-state rates;
Reconnect regressions remove each splitter and restore direct links in both orders,
checking unchanged production settings, 600 plastic and 750 rubber collected, and
undo/redo. The two recycling groups have gross output targets of 1,200, and residual rubber has
a target of 150. These are production targets, not storage demands. Regression checks
change counts to 13/20 and chosen clocks to 100% while retaining 600/750 storage
collection. Startup behavior remains outside this steady-state calculation.

## Reconstructed configured production

All quantities below are per minute: solids in items, fluids in m³.

| Stage                        | Inputs                             | Outputs                                  | Displayed count | Equivalent uniform clock, assuming no amplification |
| ---------------------------- | ---------------------------------- | ---------------------------------------- | --------------- | --------------------------------------------------- |
| Alternate: Heavy Oil Residue | 450 crude oil                      | 600 heavy oil residue; 300 polymer resin | 12              | 125%                                                |
| Water extraction             | External water source              | 1,500 water                              | 12.5            | 12.5 machine equivalents at 100%                    |
| Alternate: Diluted Fuel      | 600 heavy oil residue; 1,200 water | 1,200 fuel                               | 12              | 100%                                                |
| Alternate: Recycled Plastic  | 600 rubber; 600 fuel               | 1,200 plastic                            | 12              | 166⅔%                                               |
| Alternate: Recycled Rubber   | 600 plastic; 600 fuel              | 1,200 rubber                             | 12              | 166⅔%                                               |
| Residual Rubber              | 300 polymer resin; 300 water       | 150 rubber                               | 8               | 93.75%                                              |

Counts and material rates are visible in the screenshot. Clocks are calculated,
not legible numeric settings in the image. Member settings may differ while
producing the same totals; the screenshot does not establish their distribution.
The no-amplification configuration is a reproducible reconstruction, not a claim
about hidden settings in Modeler.

The water total is derived from the two visible demands, 1,200 + 300. At the
catalog's 120 m³/min base extraction rate, this equals 12.5 machine equivalents.
For our integer-member model, a proposed equivalent is 13 extractors: 12 at 100%
and one at 50%. This preserves material output, not necessarily the reference's
power estimate. No reference power total is visible.

## Connections and balance

- Heavy oil residue feeds Diluted Fuel; polymer resin feeds Residual Rubber.
- Water supplies both recipes: 1,200 to Diluted Fuel and 300 to Residual Rubber.
- Fuel splits 600/600 between the two recycling recipes.
- Recycled Plastic sends 600 plastic to Recycled Rubber and sends 600 plastic to storage.
- Recycled Rubber sends 600 rubber to Recycled Plastic and sends 600 rubber to storage.
- Residual Rubber supplies another 150 rubber to the same rubber destination.

Expected external balance: **450 crude oil + 1,500 water → 600 plastic + 750 rubber**.
Intermediate heavy oil residue, resin and fuel are fully consumed. The 600/min
plastic and rubber feedback streams are internal transfers, never extra exports.

The crude-oil input is shown in red and no crude source is drawn. Treat 450/min as
required external supply. Without an explicit source/declaration, analysis should
report missing supply rather than label the whole plan feasible. Green destination
values are visible accumulation/surplus indicators; our reconstruction treats them
as implicit surplus collection. This is an accumulation rate, not a guarantee that
a finite container can accept items indefinitely.

This is a steady-state calculation. The pictured residual-rubber stream goes to
storage, not back into the recycling loop, so it does not visibly seed that loop.
Starting the loop requires an initial plastic/rubber inventory or temporary feed;
startup is not proven by this screenshot.

## Proposed validation fixtures

| Case                                     | Expected result                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Configured production only               | Every stage produces exactly the table's rates, within documented numeric tolerance                    |
| Crude supply declared; storage connected | Steady-state balance feasible at the configured rates                                                  |
| No crude source/declaration              | Missing 450/min crude supply; do not invent upstream availability                                      |
| Water limited to 1,200/min               | Configured full production infeasible: demand is 1,500/min                                             |
| Feedback allocation                      | Exactly 600 plastic and 600 rubber are consumed internally; net storage collection remains 600 and 750 |
| Remove one feedback connection           | Full configured production infeasible without a replacement source                                     |
| Storage destinations without targets     | Collect surplus after consumers; finite fill time is not simulated                                     |
| Reposition nodes or route bends          | Production, feasibility and net storage collection remain unchanged                                    |

Do not assert the exact consumer starvation order in an infeasible case without
an allocation policy. A 300/min water deficit does not, by itself, determine which
recipe loses supply.

## Flow and Build applicability

Flow can reproduce the aggregate graph and its calculations, including optional
splitter nodes. Normalize the fractional water count to explicit members as above.
This does not require adding fractional groups to the product.

Build requires a new, explicitly authored physical network. The screenshot's
single lines between groups do not reveal belts/pipes per member, equipment tiers,
merger trees or distribution details. Do not interpret a group's 1,200/min fluid
link as one physical pipe. For a test catalog with 600 m³/min pipes, that transfer
needs at least two capacity paths, with suitable individual-machine connections.

With the proposed integer reconstruction, the production equipment is 44 refineries,
12 blenders and 13 water extractors, plus supply/export interfaces and explicit
logistics. This is a possible Build fixture, not a physical layout recovered from
the image. Capacity tests should then reduce one selected segment's tier and verify
that the same configured rates become infeasible where that segment is limiting.

Before creating an exact visual replica, verify the frame timestamp, hidden machine
settings and the meaning of Modeler's fractional count and destination indicators.
Those details do not prevent using the independently specified numerical scenario.
