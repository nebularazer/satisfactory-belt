import type { FactoryNode } from "@satisfactory-belt/factory-core";
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Controls edit the selected sink. */
import { useMemo } from "react";

import { InspectorButtonGroup } from "@/components/inspector-button-group";
import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorNumberField } from "@/components/inspector-number-field";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

const modes = [
  { value: "surplus", label: "Surplus" },
  { value: "rate", label: "Rate" },
];

export function InspectorSink({
  node,
  editor,
  assets,
}: {
  node: Extract<FactoryNode, { kind: "sink" }>;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const items = useMemo(
    () =>
      Object.values(assets.catalog.items)
        .filter((item) => item.sinkable)
        .map((item) => ({ value: item.id, label: item.name, iconId: item.iconId })),
    [assets.catalog],
  );
  const incoming = editor.getPortFlows({ nodeId: node.id, portKey: "input:0" });
  const first = incoming[0]?.itemId ?? items[0]?.value;
  return (
    <section className="space-y-3" aria-label="Sinking controls">
      <InspectorButtonGroup
        label="Sinking"
        value={node.sinkRate ? "rate" : "surplus"}
        options={modes}
        disabled={!first}
        onChange={(mode) =>
          editor.replaceNode({
            ...node,
            sinkRate:
              mode === "rate" && first
                ? { itemId: first, perMinute: Math.max(1, incoming[0]?.perMinute ?? 1) }
                : undefined,
          })
        }
      />
      {node.sinkRate && (
        <>
          <InspectorChoice
            label="Item"
            value={node.sinkRate.itemId}
            assets={assets}
            options={items}
            onChange={(itemId) =>
              editor.replaceNode({ ...node, sinkRate: { ...node.sinkRate!, itemId } })
            }
          />
          <InspectorNumberField
            label="Sinking rate"
            type="number"
            value={node.sinkRate.perMinute}
            revision={node}
            min={0.000001}
            max={1e9}
            unit="/min"
            onCommit={(perMinute) =>
              editor.replaceNode({ ...node, sinkRate: { ...node.sinkRate!, perMinute } })
            }
          />
        </>
      )}
    </section>
  );
}
