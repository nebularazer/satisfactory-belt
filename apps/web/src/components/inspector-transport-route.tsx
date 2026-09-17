import type { FacilityNode, TransportRoute } from "@satisfactory-belt/factory-core";
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Route controls share the selected document route. */
import { PlusIcon, ArrowUpIcon, ArrowDownIcon, XIcon } from "lucide-react";

import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { InspectorTextField } from "@/components/inspector-text-field";
import { Button } from "@/components/ui/button";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;
export function InspectorTransportRoute({
  node,
  editor,
  assets,
}: {
  node: FacilityNode;
  editor: Editor;
  assets: GameAssets;
}) {
  const c = node.configuration;
  if (c.type !== "truck-station" && c.type !== "train-station") return null;
  const document = editor.history.getSnapshot().state;
  const kind = c.type === "truck-station" ? "road" : "rail";
  const route = document.routes?.find((r) => r.id === c.routeId);
  const stations = document.nodes.filter(
    (n): n is FacilityNode => n.kind === "facility" && n.configuration.type === c.type,
  );
  const stationName = (id: string) => {
    const station = stations.find((s) => s.id === id);
    return station && "name" in station.configuration
      ? station.configuration.name
      : "Missing station";
  };
  function update(next: TransportRoute) {
    editor.setRouteSettings(next);
  }
  function numeric(
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (n: number) => void,
    integer = false,
    unit?: string,
  ) {
    return (
      <InspectorNumberField
        label={label}
        value={value}
        revision={route}
        min={min}
        max={max}
        integer={integer}
        unit={unit}
        onCommit={onCommit}
      />
    );
  }
  return (
    <section className="space-y-3 border-t pt-3" aria-label="Transport route">
      <InspectorChoice
        label="Shared route"
        value={c.routeId ?? "none"}
        options={[
          { value: "none", label: "Unassigned" },
          ...(document.routes ?? [])
            .filter((r) => r.kind === kind)
            .map((r) => ({ value: r.id, label: r.name })),
        ]}
        onChange={(id) =>
          editor.replaceNode({
            ...node,
            configuration: { ...c, routeId: id === "none" ? null : id },
          })
        }
      />
      <Button variant="outline" size="sm" onClick={() => editor.createTransportRoute(node.id)}>
        <PlusIcon />
        New {kind === "road" ? "vehicle" : "train"} route
      </Button>
      {route && (
        <>
          <InspectorTextField
            label="Route name"
            value={route.name}
            onCommit={(name) => update({ ...route, name })}
          />
          {numeric(
            kind === "road" ? "Vehicles" : "Trains",
            route.vehicleCount,
            1,
            10000,
            (vehicleCount) => update({ ...route, vehicleCount }),
            true,
          )}
          {numeric(
            "Round trip",
            route.roundTripSeconds,
            1,
            86400,
            (roundTripSeconds) => update({ ...route, roundTripSeconds }),
            false,
            "s",
          )}
          {kind === "road" && (
            <>
              <InspectorChoice
                label="Vehicle fuel"
                value={route.fuelId ?? "none"}
                assets={assets}
                options={[
                  { value: "none", label: "Unspecified" },
                  ...Object.values(assets.catalog.items)
                    .filter((i) => i.form === "solid" && (i.energyMegajoules ?? 0) > 0)
                    .map((i) => ({ value: i.id, label: i.name, iconId: i.iconId })),
                ]}
                onChange={(id) => update({ ...route, fuelId: id === "none" ? null : id })}
              />
              {numeric("Fuel per trip", route.fuelPerTrip, 0, 1000000, (fuelPerTrip) =>
                update({ ...route, fuelPerTrip }),
              )}
              <p className="text-xs text-muted-foreground">
                {(
                  (route.fuelPerTrip * route.vehicleCount * 60) /
                  route.roundTripSeconds
                ).toLocaleString("en", { maximumFractionDigits: 3 })}{" "}
                fuel items/min across this route
              </p>
            </>
          )}
          <h3 className="text-sm font-medium">{kind === "rail" ? "Timetable" : "Route stops"}</h3>
          {route.stops.map((stop, index) => (
            <section key={stop.id} className="space-y-2 rounded-lg border p-2">
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 text-xs">
                  {index + 1}. {stationName(stop.nodeId)}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move stop ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => {
                    const stops = [...route.stops];
                    [stops[index - 1], stops[index]] = [stops[index]!, stops[index - 1]!];
                    update({ ...route, stops });
                  }}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move stop ${index + 1} down`}
                  disabled={index === route.stops.length - 1}
                  onClick={() => {
                    const stops = [...route.stops];
                    [stops[index + 1], stops[index]] = [stops[index]!, stops[index + 1]!];
                    update({ ...route, stops });
                  }}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove stop ${index + 1}`}
                  onClick={() =>
                    update({ ...route, stops: route.stops.filter((_, i) => i !== index) })
                  }
                >
                  <XIcon />
                </Button>
              </div>
              {kind === "rail" && (
                <>
                  <InspectorItemFilter
                    label="Load filter"
                    values={stop.loadItemIds}
                    assets={assets}
                    onChange={(loadItemIds) =>
                      update({
                        ...route,
                        stops: route.stops.map((entry) =>
                          entry.id === stop.id ? { ...entry, loadItemIds } : entry,
                        ),
                      })
                    }
                  />
                  <InspectorItemFilter
                    label="Unload filter"
                    values={stop.unloadItemIds}
                    assets={assets}
                    onChange={(unloadItemIds) =>
                      update({
                        ...route,
                        stops: route.stops.map((entry) =>
                          entry.id === stop.id ? { ...entry, unloadItemIds } : entry,
                        ),
                      })
                    }
                  />
                  {numeric(
                    "Wait at stop",
                    stop.waitSeconds,
                    0,
                    86400,
                    (waitSeconds) =>
                      update({
                        ...route,
                        stops: route.stops.map((entry) =>
                          entry.id === stop.id ? { ...entry, waitSeconds } : entry,
                        ),
                      }),
                    false,
                    "s",
                  )}
                </>
              )}
            </section>
          ))}
          <InspectorChoice
            label="Add stop"
            value="add"
            options={[
              { value: "add", label: "Choose a station" },
              ...stations.map((s) => ({ value: s.id, label: stationName(s.id) })),
            ]}
            onChange={(id) => {
              if (id !== "add")
                update({
                  ...route,
                  stops: [
                    ...route.stops,
                    {
                      id: crypto.randomUUID(),
                      nodeId: id,
                      loadItemIds: [],
                      unloadItemIds: [],
                      waitSeconds: 0,
                    },
                  ],
                });
            }}
          />
          <p className="text-xs text-muted-foreground">
            These assumptions are shared by stations assigned to this route. Round-trip time
            includes travel, docking, and waiting.
          </p>
        </>
      )}
    </section>
  );
}

function InspectorItemFilter({
  label,
  values,
  assets,
  onChange,
}: {
  label: string;
  values: readonly string[];
  assets: GameAssets;
  onChange: (ids: readonly string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <InspectorChoice
        label={label}
        value="add"
        assets={assets}
        options={[
          { value: "add", label: values.length ? "Add item" : "Any item" },
          ...Object.values(assets.catalog.items)
            .filter((item) => !values.includes(item.id))
            .map((item) => ({ value: item.id, label: item.name, iconId: item.iconId })),
        ]}
        onChange={(id) => {
          if (id !== "add") onChange([...values, id]);
        }}
      />
      {values.map((id) => (
        <div key={id} className="flex items-center justify-between gap-1 text-xs">
          <span>{assets.catalog.items[id]!.name}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${assets.catalog.items[id]!.name} from ${label}`}
            onClick={() => onChange(values.filter((value) => value !== id))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
