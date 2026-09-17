/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Keep editing shortcuts inside the inspector. */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Only the selected link is rendered. */
import { isMaterialTransport, routeTopology } from "@satisfactory-belt/factory-core";
import type { MaterialLink } from "@satisfactory-belt/factory-core";

import { CatalogIcon } from "@/components/catalog-search-details";
import { InspectorChoice } from "@/components/inspector-choice";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
const BELT_CAPACITIES = [60, 120, 270, 480, 780, 1200];
const PIPE_CAPACITIES = [300, 600];
export function InspectorLink({
  link,
  editor,
  assets,
}: {
  link: MaterialLink;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const port = editor
    .getDisplay(link.output.nodeId)
    ?.ports.find((p) => p.key === link.output.portKey);
  if (port && !isMaterialTransport(port.transport)) {
    const closed = routeTopology(editor.history.getSnapshot().state, link.output.nodeId).closed;
    return (
      <p className="text-xs text-muted-foreground">
        {port.transport === "platform"
          ? "Connects a freight platform to its station. Assign its car number in the station inspector."
          : closed
            ? "Complete route loop. Select a station to edit its shared route settings."
            : "Incomplete route. Connect the last departure to the first arrival to close the loop."}
      </p>
    );
  }
  const pipe = port?.transport === "pipe",
    capacities = pipe ? PIPE_CAPACITIES : BELT_CAPACITIES;
  return (
    <section
      aria-label="Link settings"
      className="space-y-4"
      onKeyDown={(event) => {
        if (event.key !== "Escape" && !(event.ctrlKey || event.metaKey)) event.stopPropagation();
      }}
    >
      <InspectorChoice
        label={pipe ? "Pipeline tier" : "Conveyor tier"}
        value={String(link.tier ?? 1)}
        options={capacities.map((capacity, index) => ({
          value: String(index + 1),
          label: `Mk.${index + 1} · ${capacity} ${pipe ? "m³" : "items"}/min`,
        }))}
        onChange={(tier) => editor.setLinkTier(link.id, Number(tier))}
      />
      <p className="text-xs text-muted-foreground">
        Tier is recorded for planning. It does not limit calculated rates yet.
      </p>
      <section className="space-y-2" aria-label="Link materials">
        {[...editor.getMaterials(link.output)].map((id) => (
          <div key={id} className="flex items-center gap-2 text-sm">
            <CatalogIcon iconId={assets.catalog.items[id]!.iconId} assets={assets} size={24} />
            {assets.catalog.items[id]!.name}
          </div>
        ))}
      </section>
    </section>
  );
}
