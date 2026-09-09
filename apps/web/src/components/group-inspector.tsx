import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, Info, X } from "lucide-react";
import type { CanvasEditor } from "@/canvas/editor";
import { productionRegions } from "@/canvas/production-regions";
import {
  summarizeGroup,
  rateExpression,
  flowTotal,
  groupNumber,
  type FlowRow,
} from "@/canvas/group-summary";
import {
  descriptorImage,
  imageSrcSet,
  selectImageUrl,
} from "@/game/catalog-images";
import { MAX_GROUP_NAME_LENGTH } from "@/canvas/group-names";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function GroupInspector({ editor }: { editor: CanvasEditor }) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  const group = state.selectedGroupId
    ? productionRegions(state.document, editor.topology).find(
        (group) => group.id === state.selectedGroupId,
      )
    : undefined;
  const summary = useMemo(
    () => (group ? summarizeGroup(state.document, group) : undefined),
    [state.document, group],
  );
  if (!group || !summary || state.moveDelta) return null;
  return (
    <aside
      aria-label="Group details"
      className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 flex max-h-[65dvh] flex-col rounded-t-2xl border border-border bg-card text-card-foreground shadow-xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[24rem] lg:rounded-xl"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
        <Info
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <h2
            className="line-clamp-2 break-words font-semibold"
            title={group.name}
          >
            {group.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {group.logistics ? "Logistics group" : "Production group"} ·{" "}
            {group.count} nodes
          </p>
        </div>
        <Button
          aria-label="Close group details"
          size="icon"
          variant="ghost"
          onClick={() => editor.dispatch({ type: "selection.clear" })}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="space-y-5 overflow-y-auto p-4 text-sm">
        {group.logistics && (
          <section aria-label="Balancer">
            <h3 className="mb-2 font-medium">Balancer</h3>
            {summary.inputs.map((input) => (
              <div key={input.item} className="mb-2 rounded-lg bg-muted/50 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MaterialIcon row={input} />
                  <span>
                    {input.item} · {input.unit}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 tabular-nums">
                  <span>{rateExpression(input.rates)}</span>
                  <ArrowRight aria-label="to" className="size-4 shrink-0" />
                  <span>
                    {summary.outputs
                      .filter((output) => output.item === input.item)
                      .map(
                        (output) =>
                          `${rateExpression(output.rates)}${output.remainder ? " (remainder)" : ""}`,
                      )
                      .join(" + ") || "No outgoing links"}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
        {!group.logistics && summary.recipes.join(", ") !== group.name && (
          <section>
            <h3 className="font-medium">Recipe</h3>
            <p className="text-muted-foreground">
              {summary.recipes.join(", ")}
            </p>
          </section>
        )}
        <FlowSection
          title="Items in"
          rows={group.logistics ? summary.inputs : summary.consumption}
          showRates={!group.logistics}
        />
        <FlowSection
          title="Items out"
          rows={group.logistics ? summary.outputTotals : summary.production}
          showRates={!group.logistics}
        />
        {!group.logistics && (
          <>
            {summary.clocks.length > 0 && (
              <section>
                <h3 className="font-medium">Clock speeds</h3>
                <p className="text-muted-foreground">
                  {rateExpression(summary.clocks, "%")}
                </p>
              </section>
            )}
            <section>
              <h3 className="font-medium">Power</h3>
              <p>{powerRange(summary.power.consumed)} MW consumed</p>
              {summary.power.produced.maximumMw > 0 && (
                <p>{powerRange(summary.power.produced)} MW generated</p>
              )}
            </section>
          </>
        )}
        <section>
          <h3 className="mb-1 font-medium">Buildings</h3>
          <dl>
            {summary.buildings.map((building) => (
              <div key={building.name} className="flex justify-between gap-3">
                <dt>{building.name}</dt>
                <dd className="tabular-nums">{building.count}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <table className="mt-2 w-full text-left text-xs tabular-nums">
            <caption className="sr-only">
              Belts and pipes by tier and group boundary
            </caption>
            <thead>
              <tr>
                <th className="py-1 font-medium">Tier</th>
                <th>In</th>
                {group.logistics && <th>Internal</th>}
                <th>Out</th>
              </tr>
            </thead>
            <tbody>
              {summary.tiers.map((tier) => (
                <tr key={tier.name}>
                  <td className="py-1">{tier.name}</td>
                  <td>{tier.incoming}</td>
                  {group.logistics && <td>{tier.internal}</td>}
                  <td>{tier.outgoing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {group.logistics && (
          <section>
            <h3 className="font-medium">Feedback loops</h3>
            <p className="text-muted-foreground">
              {summary.feedbackCount} internal return{" "}
              {summary.feedbackCount === 1 ? "link" : "links"}
            </p>
            {summary.feedback.length > 0 && (
              <FlowRows rows={summary.feedback} showRates={false} />
            )}
          </section>
        )}
        <GroupNameForm
          key={`${group.id}:${group.name}`}
          editor={editor}
          group={group}
        />
      </div>
    </aside>
  );
}
function GroupNameForm({
  editor,
  group,
}: {
  editor: CanvasEditor;
  group: ReturnType<typeof productionRegions>[number];
}) {
  const [name, setName] = useState(group.name);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.dispatch({ type: "group.rename", id: group.id, name });
      }}
    >
      <label className="text-sm font-medium" htmlFor="group-name">
        Group name
      </label>
      <Input
        id="group-name"
        className="mt-1"
        value={name}
        maxLength={MAX_GROUP_NAME_LENGTH}
        onChange={(event) => setName(event.target.value)}
        placeholder={group.defaultName}
      />
      <div className="mt-3 flex gap-2">
        <Button
          type="submit"
          disabled={!name.trim() || name.trim() === group.name}
        >
          Save name
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={group.name === group.defaultName}
          onClick={() =>
            editor.dispatch({ type: "group.rename", id: group.id, name: "" })
          }
        >
          Reset name
        </Button>
      </div>
    </form>
  );
}

function powerRange(power: { minimumMw: number; maximumMw: number }) {
  return power.minimumMw === power.maximumMw
    ? groupNumber.format(power.maximumMw)
    : `${groupNumber.format(power.minimumMw)}–${groupNumber.format(power.maximumMw)}`;
}
function MaterialIcon({ row }: { row: FlowRow }) {
  if (!row.itemId) return null;
  const image = descriptorImage(row.itemId);
  return (
    <img
      alt=""
      aria-hidden="true"
      className="size-6 shrink-0 object-contain"
      decoding="async"
      sizes="24px"
      src={selectImageUrl(image, 48)}
      srcSet={imageSrcSet(image)}
    />
  );
}
function FlowSection({
  title,
  rows,
  showRates,
}: {
  title: string;
  rows: readonly FlowRow[];
  showRates: boolean;
}) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1 font-medium">{title}</h3>
      {!rows.length && <p className="text-xs text-muted-foreground">None</p>}
      <FlowRows rows={rows} showRates={showRates} />
    </section>
  );
}
function FlowRows({
  rows,
  showRates,
}: {
  rows: readonly FlowRow[];
  showRates: boolean;
}) {
  return rows.map((row, index) => (
    <div key={index} className="mt-2 flex items-center gap-2">
      <MaterialIcon row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-3">
          <span>{row.item}</span>
          <span className="shrink-0 tabular-nums">
            {flowTotal(row.rates) === undefined
              ? "Unresolved"
              : groupNumber.format(flowTotal(row.rates)!)}{" "}
            {row.unit}
          </span>
        </div>
        {showRates && row.rates.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {rateExpression(row.rates)}
          </p>
        )}
      </div>
    </div>
  ));
}
