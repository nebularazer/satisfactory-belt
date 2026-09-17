/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Rule-group hover/focus identifies its matching canvas port. */
/* oxlint-disable oxc/no-map-spread -- Candidate rules are immutable document values. */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Only the selected inspector constructs these choices. */
import {
  DEFAULT_SPLITTER_PROGRAM,
  SPLITTER_OUTPUTS,
  withRecipe,
} from "@satisfactory-belt/factory-core";
import type { FactoryNode, SplitterRule } from "@satisfactory-belt/factory-core";
import { recipeAlternatives } from "@satisfactory-belt/game-data/search";
import { PlusIcon, XIcon } from "lucide-react";
import { useEffect } from "react";

import { InspectorChoice } from "@/components/inspector-choice";
import { Button } from "@/components/ui/button";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;
const ruleKey = (rule: SplitterRule) => (rule.kind === "item" ? `item:${rule.itemId}` : rule.kind);
const fromKey = (key: string): SplitterRule => {
  if (key.startsWith("item:")) return { kind: "item", itemId: key.slice(5) };
  if (key === "any" || key === "none" || key === "any-undefined" || key === "overflow")
    return { kind: key };
  throw new Error("Invalid splitter rule.");
};
export function InspectorConfiguration({
  node,
  editor,
  assets,
}: {
  node: FactoryNode;
  editor: Editor;
  assets: GameAssets;
}) {
  const c = assets.catalog;
  useEffect(() => () => editor.controller.highlightPort(null), [editor]);
  const alternatives =
    node.kind === "manufacturing"
      ? new Set(recipeAlternatives(c, node.recipeId))
      : new Set<string>();
  if (node.kind === "manufacturing")
    return (
      <InspectorChoice
        label="Recipe · shared by all machines"
        value={node.recipeId}
        assets={assets}
        options={Object.values(c.recipes)
          .filter((r) => r.machineIds.includes(node.machineId) || alternatives.has(r.id))
          .map((r) => ({
            value: r.id,
            label: r.name,
            description: r.machineIds.includes(node.machineId)
              ? undefined
              : c.machines[r.machineIds[0]!]!.name,
            iconId: c.items[r.products[0]!.itemId]!.iconId,
            disabled: () => !editor.canReplaceNode(withRecipe(node, r.id, c)),
          }))}
        onChange={(recipeId) => editor.replaceNode(withRecipe(node, recipeId, c))}
      />
    );
  if (node.kind === "extractor")
    return (
      <div className="space-y-3">
        <InspectorChoice
          label="Resource · shared by all machines"
          value={node.resourceId}
          assets={assets}
          options={c.extractors[node.extractorId]!.resourceIds.map((id) => ({
            value: id,
            label: c.items[id]!.name,
            iconId: c.items[id]!.iconId,
            disabled: () => !editor.canReplaceNode({ ...node, resourceId: id }),
          }))}
          onChange={(resourceId) => editor.replaceNode({ ...node, resourceId })}
        />
        {Object.values(c.extractors).filter((e) => e.resourceIds.includes(node.resourceId)).length >
          1 && (
          <InspectorChoice
            label="Miner tier · shared by all machines"
            value={node.extractorId}
            assets={assets}
            options={Object.values(c.extractors)
              .filter((e) => e.resourceIds.includes(node.resourceId))
              .map((e) => ({
                value: e.id,
                label: e.name,
                iconId: e.iconId,
                disabled: () => !editor.canReplaceNode({ ...node, extractorId: e.id }),
              }))}
            onChange={(extractorId) => editor.replaceNode({ ...node, extractorId })}
          />
        )}
      </div>
    );
  if (node.kind !== "logistics") return null;
  const part = c.logistics[node.partId]!;
  const configurable = part.kind === "smart-splitter" || part.kind === "programmable-splitter";
  const program = node.program ?? DEFAULT_SPLITTER_PROGRAM;
  const special = [
    { value: "any", label: "Any", description: "Any incoming item" },
    { value: "none", label: "None", description: "This output is closed" },
    {
      value: "any-undefined",
      label: "Any undefined",
      description: "Items not explicitly named on any output",
    },
    {
      value: "overflow",
      label: "Overflow",
      description: "Used when other matching outputs cannot accept an item",
    },
  ];
  const options = [
    ...special,
    ...Object.values(c.items)
      .filter((i) => i.form === "solid")
      .map((i) => ({ value: `item:${i.id}`, label: i.name, iconId: i.iconId })),
  ];
  const total = Object.values(program).reduce((sum, rules) => sum + rules.length, 0);
  return (
    <div className="space-y-4">
      {part.kind !== "merger" && (
        <InspectorChoice
          label="Splitter type"
          value={part.id}
          assets={assets}
          options={Object.values(c.logistics)
            .filter((p) => p.kind !== "merger")
            .map((p) => {
              const candidate: FactoryNode = {
                ...node,
                partId: p.id,
                program: p.kind === "splitter" ? undefined : program,
              };
              return {
                value: p.id,
                label: p.name,
                iconId: p.iconId,
                disabled: () => !editor.canReplaceNode(candidate),
              };
            })}
          onChange={(partId) =>
            editor.replaceNode({
              ...node,
              partId,
              program: c.logistics[partId]!.kind === "splitter" ? undefined : program,
            })
          }
        />
      )}
      {configurable &&
        SPLITTER_OUTPUTS.map((output, index) => (
          <section
            key={output}
            className="space-y-2 rounded-lg border p-3"
            aria-label={`Output ${index + 1} rules`}
            onPointerEnter={() =>
              editor.controller.highlightPort({ nodeId: node.id, portKey: output })
            }
            onPointerLeave={() => editor.controller.highlightPort(null)}
            onFocus={() => editor.controller.highlightPort({ nodeId: node.id, portKey: output })}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                editor.controller.highlightPort(null);
            }}
          >
            <h3 className="text-sm font-medium">
              Output {index + 1} · {index === 0 ? "Top" : index === 1 ? "Center" : "Bottom"}
            </h3>
            {program[output].map((rule, ruleIndex) => (
              <div key={ruleKey(rule)} className="flex items-end gap-1">
                <div className="min-w-0 flex-1">
                  <InspectorChoice
                    label={part.kind === "smart-splitter" ? "Rule" : `Rule ${ruleIndex + 1}`}
                    value={ruleKey(rule)}
                    assets={assets}
                    options={options.map((option) => {
                      const rules = program[output].map((r, i) =>
                        i === ruleIndex ? fromKey(option.value) : r,
                      );
                      return {
                        ...option,
                        disabled: () =>
                          !editor.canReplaceNode({
                            ...node,
                            program: { ...program, [output]: rules },
                          }),
                      };
                    })}
                    onChange={(key) =>
                      editor.replaceNode({
                        ...node,
                        program: {
                          ...program,
                          [output]: program[output].map((r, i) =>
                            i === ruleIndex ? fromKey(key) : r,
                          ),
                        },
                      })
                    }
                  />
                </div>
                {program[output].length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove rule ${ruleIndex + 1} from output ${index + 1}`}
                    disabled={
                      !editor.canReplaceNode({
                        ...node,
                        program: {
                          ...program,
                          [output]: program[output].filter((_, i) => i !== ruleIndex),
                        },
                      })
                    }
                    onClick={() =>
                      editor.replaceNode({
                        ...node,
                        program: {
                          ...program,
                          [output]: program[output].filter((_, i) => i !== ruleIndex),
                        },
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
            {part.kind === "programmable-splitter" && (
              <Button
                variant="outline"
                size="sm"
                disabled={total >= 64 || program[output].some((r) => r.kind === "none")}
                onClick={() =>
                  editor.replaceNode({
                    ...node,
                    program: { ...program, [output]: [...program[output], { kind: "none" }] },
                  })
                }
              >
                <PlusIcon />
                Add rule
              </Button>
            )}
          </section>
        ))}
      {part.kind === "programmable-splitter" && (
        <p className="text-xs text-muted-foreground">{total}/64 rules</p>
      )}
    </div>
  );
}
