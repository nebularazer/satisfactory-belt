import { findBuildable, findDescriptor } from "@satisfactory-belt/production";
import { Plus, Trash2 } from "lucide-react";
import {
  nodeResources,
  resourceNodeCapacity,
  type ResourceNodeBudget,
} from "@/auto-build/resource-nodes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-popover px-2 text-xs text-popover-foreground";
export function defaultResourceBudget(
  itemId = "Desc_OreIron_C",
): ResourceNodeBudget {
  return {
    itemId,
    buildableId: nodeResources.find((resource) => resource.itemId === itemId)!
      .buildableIds[0]!,
    impure: 0,
    normal: 1,
    pure: 0,
    maximumClockPercent: 100,
  };
}

export function ResourceNodeFields({
  value,
  onChange,
  disabled,
}: {
  value: readonly ResourceNodeBudget[] | undefined;
  onChange: (value: readonly ResourceNodeBudget[] | undefined) => void;
  disabled: boolean;
}) {
  const change = (index: number, patch: Partial<ResourceNodeBudget>) =>
    onChange(
      value?.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  return (
    <fieldset
      disabled={disabled}
      className="grid min-w-0 gap-3 disabled:opacity-60"
    >
      <details>
        <summary className="cursor-pointer font-medium">
          Available resource nodes · {value ? "limited" : "unlimited"}
        </summary>
        <p className="my-2 text-muted-foreground">
          Direct mining is used by default. Limit this generated group to your
          mineral and oil nodes below. Water extractors and resource wells
          remain unrestricted.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value !== undefined}
            onChange={(event) =>
              onChange(
                event.target.checked ? [defaultResourceBudget()] : undefined,
              )
            }
          />
          Use only my listed mineral and oil nodes
        </label>
        {value && (
          <div className="mt-3 grid gap-3">
            {value.map((budget, index) => {
              const resource = nodeResources.find(
                (resource) => resource.itemId === budget.itemId,
              )!;
              let capacity: number | undefined;
              try {
                capacity = resourceNodeCapacity(budget);
              } catch {
                /* The form and generation report invalid input. */
              }
              return (
                <div
                  key={budget.itemId}
                  className="grid min-w-0 gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <label className="grid min-w-0 flex-1 gap-1">
                      Resource
                      <select
                        className={selectClass}
                        aria-label={`Resource ${index + 1}`}
                        value={budget.itemId}
                        onChange={(event) =>
                          change(
                            index,
                            defaultResourceBudget(event.target.value),
                          )
                        }
                      >
                        {nodeResources
                          .filter(
                            (item) =>
                              item.itemId === budget.itemId ||
                              !value.some(
                                (entry) => entry.itemId === item.itemId,
                              ),
                          )
                          .map((item) => (
                            <option key={item.itemId} value={item.itemId}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${resource.name} nodes`}
                      onClick={() =>
                        onChange(value.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid min-w-0 gap-1">
                      Extractor
                      <select
                        className={selectClass}
                        aria-label={`${resource.name} extractor`}
                        value={budget.buildableId}
                        onChange={(event) =>
                          change(index, { buildableId: event.target.value })
                        }
                      >
                        {resource.buildableIds.map((id) => (
                          <option value={id} key={id}>
                            {findBuildable(id)?.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      Max clock (%)
                      <Input
                        aria-label={`${resource.name} maximum clock`}
                        type="number"
                        min={1}
                        max={100}
                        step="any"
                        required
                        value={budget.maximumClockPercent}
                        onChange={(event) =>
                          change(index, {
                            maximumClockPercent: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(["impure", "normal", "pure"] as const).map((purity) => (
                      <label className="grid gap-1 capitalize" key={purity}>
                        {purity}
                        <Input
                          aria-label={`${resource.name} ${purity} nodes`}
                          type="number"
                          min={0}
                          max={10000}
                          step={1}
                          required
                          value={budget[purity]}
                          onChange={(event) =>
                            change(index, {
                              [purity]: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {capacity !== undefined && (
                    <p className="text-muted-foreground">
                      Up to{" "}
                      {new Intl.NumberFormat("en-US", {
                        maximumFractionDigits: 2,
                      }).format(capacity)}{" "}
                      {findDescriptor(resource.itemId)?.form === "solid"
                        ? "items/min"
                        : "m³/min"}
                    </p>
                  )}
                </div>
              );
            })}
            {!value.length && (
              <p className="text-muted-foreground">
                No mineral or oil nodes available. Add a resource to allow
                extraction.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              disabled={value.length === nodeResources.length}
              onClick={() => {
                const next = nodeResources.find(
                  (resource) =>
                    !value.some((entry) => entry.itemId === resource.itemId),
                );
                if (next)
                  onChange([...value, defaultResourceBudget(next.itemId)]);
              }}
            >
              <Plus className="size-4" />
              Add resource
            </Button>
          </div>
        )}
      </details>
    </fieldset>
  );
}
