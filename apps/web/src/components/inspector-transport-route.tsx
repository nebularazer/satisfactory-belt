/* oxlint-disable oxc/no-map-spread -- Preserve immutable route settings for undo. */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Inspector route settings. */
import { routeTopology, stationRoute } from "@satisfactory-belt/factory-core";
import type { FacilityNode, TransportRoute } from "@satisfactory-belt/factory-core";

import { InspectorNumberField } from "@/components/inspector-number-field";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

export function InspectorTransportRoute({
  node,
  editor,
  assets,
}: {
  node: FacilityNode;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const document = editor.history.getSnapshot().state;
  const route = stationRoute(document, node);
  const topology = routeTopology(document, node.id);
  if (!route)
    return (
      <p className="text-xs text-muted-foreground">
        Connect the square route ports to other stations and close the loop.
      </p>
    );
  function update(next: TransportRoute) {
    editor.setRouteSettings(next);
  }
  return (
    <section className="space-y-3 border-t pt-4" aria-label="Transport route">
      <div className="flex items-center justify-between gap-2 text-xs">
        <h3 className="font-medium">Route</h3>
        <span className="text-muted-foreground">
          {topology.closed ? "Complete loop" : "Incomplete loop"}
        </span>
      </div>
      <ol className="space-y-1 text-xs">
        {topology.nodeIds.map((id, index) => {
          const station = document.nodes.find((n) => n.id === id);
          return (
            <li key={id}>
              {index + 1}.{" "}
              {station?.kind === "facility"
                ? assets.catalog.buildings![station.buildingId]!.name
                : "Station"}
              {id === node.id ? " · this station" : ""}
            </li>
          );
        })}
      </ol>
      {!topology.closed && (
        <p className="text-xs text-muted-foreground">
          Connect each square departure port to the next station’s arrival. Close the loop to
          complete the route.
        </p>
      )}
      <InspectorNumberField
        label={route.kind === "rail" ? "Trains" : route.kind === "drone" ? "Drones" : "Vehicles"}
        value={route.vehicleCount}
        min={1}
        max={route.kind === "drone" ? 2 : 10000}
        integer
        revision={route}
        onCommit={(vehicleCount) => update({ ...route, vehicleCount })}
      />
      <InspectorNumberField
        label="Round trip"
        value={route.roundTripSeconds}
        min={1}
        max={86400}
        unit="s"
        revision={route}
        onCommit={(roundTripSeconds) => update({ ...route, roundTripSeconds })}
      />
      {route.kind === "road" && (
        <>
          <InspectorNumberField
            label="Fuel per trip"
            value={route.fuelPerTrip}
            min={0}
            revision={route}
            onCommit={(fuelPerTrip) => update({ ...route, fuelPerTrip })}
          />
        </>
      )}
      {route.kind === "rail" &&
        route.stops
          .filter((stop) => stop.nodeId === node.id)
          .map((stop) => (
            <div key={stop.id} className="space-y-3">
              <InspectorNumberField
                label="Wait at stop"
                value={stop.waitSeconds}
                min={0}
                max={86400}
                unit="s"
                revision={route}
                onCommit={(waitSeconds) =>
                  update({
                    ...route,
                    stops: route.stops.map((entry) =>
                      entry.id === stop.id ? { ...entry, waitSeconds } : entry,
                    ),
                  })
                }
              />
            </div>
          ))}
    </section>
  );
}
