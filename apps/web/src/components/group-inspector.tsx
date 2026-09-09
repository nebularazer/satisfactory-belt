import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, ScanEye, X } from "lucide-react";
import type { CanvasEditor } from "@/canvas/editor";
import { productionRegions } from "@/canvas/production-regions";
import {
  summarizeGroup,
  rateExpression,
  flowTotal,
  groupNumber,
  type FlowRow,
} from "@/canvas/group-summary";
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
        <ScanEye
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
                <p className="mb-1 text-xs text-muted-foreground">
                  {input.item} · {input.unit}
                </p>
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
        {!group.logistics && (
          <>
            <section>
              <h3 className="font-medium">Recipe</h3>
              <p className="text-muted-foreground">
                {summary.recipes.join(", ")}
              </p>
            </section>
            <FlowSection
              title="Recipe consumption"
              rows={summary.consumption}
            />
            <FlowSection title="Recipe production" rows={summary.production} />
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
              <p>Consumption: {powerRange(summary.power.consumed)} MW</p>
              {summary.power.produced.maximumMw > 0 && (
                <p>Generation: {powerRange(summary.power.produced)} MW</p>
              )}
            </section>
          </>
        )}
        <FlowSection title="Items in" rows={summary.inputs} />
        <FlowSection title="Items out" rows={summary.outputs} />
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
          <h3 className="font-medium">Connections</h3>
          <p className="text-muted-foreground">
            {summary.incomingCount} incoming · {summary.internalCount} internal
            · {summary.outgoingCount} outgoing
          </p>
          <table className="mt-2 w-full text-left text-xs tabular-nums">
            <caption className="sr-only">
              Belts and pipes by tier and group boundary
            </caption>
            <thead>
              <tr>
                <th className="py-1 font-medium">Tier</th>
                <th>In</th>
                <th>Internal</th>
                <th>Out</th>
              </tr>
            </thead>
            <tbody>
              {summary.tiers.map((tier) => (
                <tr key={tier.name}>
                  <td className="py-1">{tier.name}</td>
                  <td>{tier.incoming}</td>
                  <td>{tier.internal}</td>
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
              {summary.feedbackCount === 1 ? "link" : "links"}. Excluded from
              items in and out.
            </p>
            {summary.feedback.map((row) => (
              <p key={row.item} className="mt-1">
                {row.item}: {rateExpression(row.rates)} {row.unit}
              </p>
            ))}
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
function FlowSection({
  title,
  rows,
}: {
  title: string;
  rows: readonly FlowRow[];
}) {
  return (
    <section>
      <h3 className="mb-1 font-medium">{title}</h3>
      {!rows.length && <p className="text-xs text-muted-foreground">None</p>}
      {rows.map((row, index) => (
        <div key={index} className="mt-2">
          <div className="flex justify-between gap-3">
            <span>{row.item}</span>
            <span className="shrink-0 tabular-nums">
              {flowTotal(row.rates) === undefined
                ? "Unresolved"
                : groupNumber.format(flowTotal(row.rates)!)}{" "}
              {row.unit}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {rateExpression(row.rates)}
            {row.remainder ? " · Remainder" : ""}
          </p>
          {row.destination && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight aria-hidden="true" className="size-3 shrink-0" />
              {row.destination}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
