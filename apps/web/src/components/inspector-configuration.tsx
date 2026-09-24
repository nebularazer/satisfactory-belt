/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Rule-group hover/focus identifies its matching canvas port. */
/* oxlint-disable oxc/no-map-spread -- Candidate rules are immutable document values. */
/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Only the selected inspector constructs these choices. */
import {
  DEFAULT_SPLITTER_PROGRAM,
  SPLITTER_OUTPUTS,
  commonSetting,
  scopedMachines,
  withRecipe,
} from "@satisfactory-belt/factory-core";
import type {
  FactoryNode,
  LogisticsNode,
  SplitterRule,
  SplitterOutput,
} from "@satisfactory-belt/factory-core";
import { recipeAlternatives } from "@satisfactory-belt/game-data/search";
import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { InspectorButtonGroup } from "@/components/inspector-button-group";
import { InspectorChoice } from "@/components/inspector-choice";
import { PURITY_OPTIONS } from "@/components/inspector-facility";
import { Button } from "@/components/ui/button";
import { InputGroupButton } from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
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
  scope,
  editor,
  assets,
}: {
  node: FactoryNode;
  scope: string;
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
        label="Recipe"
        value={node.recipeId}
        assets={assets}
        options={Object.values(c.recipes)
          .filter((r) => r.machineIds.includes(node.machineId) || alternatives.has(r.id))
          .map((r) => ({
            value: r.id,
            label: r.name.replace(/^Alternate:\s*/i, ""),
            badge: r.alternate ? "Alternate" : undefined,
            description: r.machineIds.includes(node.machineId)
              ? undefined
              : c.machines[r.machineIds[0]!]!.name,
            iconId: c.items[r.products[0]!.itemId]!.iconId,
            disabled: () => !editor.canReplaceNode(withRecipe(node, r.id, c)),
          }))}
        onChange={(recipeId) => editor.replaceNode(withRecipe(node, recipeId, c))}
      />
    );
  if (node.kind === "extractor") {
    const extractor = c.extractors[node.extractorId]!;
    const tiers = Object.values(c.extractors).filter((entry) =>
      entry.resourceIds.includes(node.resourceId),
    );
    if (extractor.resourceIds.length <= 1 && tiers.length <= 1 && !extractor.hasPurity) return null;
    const purity = commonSetting(scopedMachines(node, scope), "purity");
    return (
      <div className="space-y-3">
        {extractor.resourceIds.length > 1 && (
          <InspectorChoice
            label="Resource"
            value={node.resourceId}
            assets={assets}
            options={extractor.resourceIds.map((id) => ({
              value: id,
              label: c.items[id]!.name,
              iconId: c.items[id]!.iconId,
              disabled: () => !editor.canReplaceNode({ ...node, resourceId: id }),
            }))}
            onChange={(resourceId) => editor.replaceNode({ ...node, resourceId })}
          />
        )}
        {tiers.length > 1 && (
          <InspectorButtonGroup
            label="Miner tier"
            disabled={scope !== "all"}
            value={node.extractorId}
            options={tiers.map((e) => ({
              value: e.id,
              label: e.name.replace(/^Miner\s*/i, ""),
              iconId: e.iconId,
              disabled: () => !editor.canReplaceNode({ ...node, extractorId: e.id }),
            }))}
            onChange={(extractorId) => editor.replaceNode({ ...node, extractorId })}
          />
        )}
        {extractor.hasPurity && (
          <InspectorButtonGroup
            label="Purity"
            disabled={scope !== "all"}
            value={purity === null ? null : String(purity)}
            options={PURITY_OPTIONS}
            onChange={(value) =>
              editor.setOperatingSetting(node.id, "all", "purity", Number(value))
            }
          />
        )}
      </div>
    );
  }
  if (node.kind !== "logistics") return null;
  const part = c.logistics[node.partId]!;
  const configurable = part.kind === "smart-splitter" || part.kind === "programmable-splitter";
  if (!configurable) return null;
  return (
    <div className="space-y-5">
      {SPLITTER_OUTPUTS.map((output, index) => (
        <SplitterOutputRules
          key={output}
          node={node}
          output={output}
          label={["Left", "Center", "Right"][index]!}
          editor={editor}
          assets={assets}
        />
      ))}
    </div>
  );
}

function SplitterOutputRules({
  node,
  output,
  label,
  editor,
  assets,
}: {
  node: LogisticsNode;
  output: SplitterOutput;
  label: string;
  editor: Editor;
  assets: GameAssets;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const program = node.program ?? DEFAULT_SPLITTER_PROGRAM;
  const rules = program[output];
  const smart = assets.catalog.logistics[node.partId]!.kind === "smart-splitter";
  const special = [
    { value: "any", label: "Any", pinned: true },
    { value: "none", label: "None", pinned: true },
    { value: "any-undefined", label: "Any undefined", pinned: true },
    { value: "overflow", label: "Overflow", pinned: true },
  ];
  const options = [
    ...special,
    ...Object.values(assets.catalog.items)
      .filter((item) => item.form === "solid")
      .map((item) => ({ value: `item:${item.id}`, label: item.name, iconId: item.iconId })),
  ];
  function candidate(next: readonly SplitterRule[]): LogisticsNode {
    return { ...node, program: { ...program, [output]: next } };
  }
  const added = (key: string) => candidate(smart ? [fromKey(key)] : [...rules, fromKey(key)]);
  const choices = options.map((option) => {
    const selected = rules.some((rule) => ruleKey(rule) === option.value);
    return {
      ...option,
      hideDisabledBadge: selected,
      disabled: () => (!smart && selected) || !editor.canReplaceNode(added(option.value)),
    };
  });
  return (
    <section
      className="space-y-2"
      aria-label={`${label} output rules`}
      onPointerEnter={() => editor.controller.highlightPort({ nodeId: node.id, portKey: output })}
      onPointerLeave={() => editor.controller.highlightPort(null)}
      onFocus={() => editor.controller.highlightPort({ nodeId: node.id, portKey: output })}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          editor.controller.highlightPort(null);
      }}
    >
      <Marker variant="separator">
        <MarkerContent>{label} output</MarkerContent>
      </Marker>
      {smart ? (
        <InspectorChoice
          hideLabel
          label={`${label} output`}
          value={rules[0] ? ruleKey(rules[0]) : "none"}
          options={choices}
          assets={assets}
          onChange={(value) => editor.replaceNode(added(value))}
        />
      ) : (
        <>
          <ul className="space-y-1">
            {rules.map((rule) => {
              const key = ruleKey(rule);
              const item = rule.kind === "item" ? assets.catalog.items[rule.itemId] : undefined;
              const name = item?.name ?? special.find((option) => option.value === key)!.label;
              const removed = candidate(rules.filter((existing) => ruleKey(existing) !== key));
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  {item && <CatalogIcon iconId={item.iconId} assets={assets} size={24} />}
                  <span className="min-w-0 flex-1">{name}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${name} from ${label} output`}
                    disabled={!editor.canReplaceNode(removed)}
                    onClick={() => editor.replaceNode(removed)}
                  >
                    <XIcon />
                  </Button>
                </li>
              );
            })}
          </ul>
          <InspectorChoice
            hideLabel
            label={`Add item or rule to ${label} output`}
            value={pending ?? "choose"}
            options={choices}
            assets={assets}
            onChange={setPending}
            inputAction={
              <InputGroupButton
                aria-label={`Add rule to ${label} output`}
                disabled={
                  !pending ||
                  rules.some((rule) => ruleKey(rule) === pending) ||
                  !editor.canReplaceNode(added(pending))
                }
                onClick={() => {
                  if (pending) {
                    editor.replaceNode(added(pending));
                    setPending(null);
                  }
                }}
              >
                <PlusIcon />
                Add
              </InputGroupButton>
            }
          />
        </>
      )}
    </section>
  );
}
