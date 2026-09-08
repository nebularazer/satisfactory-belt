import { ResourceNodeFields } from "./resource-node-fields";
import type { ResourceNodeBudget } from "@/auto-build/resource-nodes";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  findDescriptor,
  findRecipe,
  listDescriptors,
  recipesProducing,
  searchRecipes,
} from "@satisfactory-belt/production";
import { Plus, Trash2, WandSparkles } from "lucide-react";
import type { AutoBuildSettings } from "@/auto-build/production-request";
import type { AutoBuildStage } from "@/auto-build/request-auto-build";
import { descriptorImage, selectImageUrl } from "@/game/catalog-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const producibleItems = listDescriptors()
  .filter((item) => recipesProducing(item.id).length > 0)
  .toSorted((a, b) => a.name.localeCompare(b.name));
const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-popover px-2 text-xs text-popover-foreground focus-visible:outline-2 focus-visible:outline-ring";

type Props = {
  itemId: string;
  onClose: () => void;
  onGenerate: (
    settings: AutoBuildSettings,
    signal: AbortSignal,
    onStage: (stage: AutoBuildStage) => void,
  ) => Promise<void>;
};

function ItemImage({ itemId }: { itemId: string }) {
  const image = descriptorImage(itemId);
  return image ? (
    <img
      alt=""
      className="size-8 shrink-0 object-contain"
      src={selectImageUrl(image, 64)}
    />
  ) : null;
}

export function AutoBuildDialog({ itemId, onClose, onGenerate }: Props) {
  const [outputs, setOutputs] = useState([{ itemId, rate: "10" }]);
  const [addingOutput, setAddingOutput] = useState(false);
  const [outputSearch, setOutputSearch] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [allowedAlternateIds, setAllowedAlternateIds] = useState<string[]>([]);
  const [pinnedRecipes, setPinnedRecipes] = useState<Record<string, string>>(
    {},
  );
  const [resourceNodes, setResourceNodes] = useState<
    readonly ResourceNodeBudget[] | undefined
  >();
  const [stage, setStage] = useState<AutoBuildStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const availableOutputs = useMemo(
    () =>
      producibleItems
        .filter(
          (item) =>
            !outputs.some((output) => output.itemId === item.id) &&
            item.name.toLowerCase().includes(outputSearch.trim().toLowerCase()),
        )
        .slice(0, 12),
    [outputs, outputSearch],
  );
  const alternatives = useMemo(
    () => searchRecipes(recipeSearch).filter((recipe) => recipe.alternate),
    [recipeSearch],
  );
  const enabledAlternates = new Set([
    ...allowedAlternateIds,
    ...Object.values(pinnedRecipes).filter((id) => findRecipe(id)?.alternate),
  ]);
  const busy = stage !== null;
  const close = () => {
    controller.current?.abort();
    onClose();
  };
  const pin = (outputId: string, recipeId: string) =>
    setPinnedRecipes((current) => {
      const next = { ...current };
      if (recipeId) next[outputId] = recipeId;
      else delete next[outputId];
      return next;
    });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setStage("Generating production");
    try {
      await onGenerate(
        {
          outputs: outputs.map((output) => ({
            itemId: output.itemId,
            ratePerMinute: Number(output.rate),
          })),
          allowedAlternateIds,
          pinnedRecipes,
          resourceNodes,
        },
        abort.signal,
        setStage,
      );
      if (!abort.signal.aborted) onClose();
    } catch (error) {
      if (!abort.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "The plan could not be generated.",
        );
    } finally {
      if (!abort.signal.aborted) setStage(null);
      controller.current = null;
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        aria-busy={busy}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WandSparkles className="size-4" />
            Auto-build production
          </DialogTitle>
          <DialogDescription>
            Choose your outputs. We’ll build and arrange a Basic production
            plan, ready to edit or expand into Detailed.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <fieldset
            disabled={busy}
            className="grid min-w-0 gap-3 disabled:opacity-60"
          >
            <legend className="mb-2 font-medium">Produce</legend>
            {outputs.map((output, index) => {
              const item = findDescriptor(output.itemId)!;
              return (
                <div
                  key={output.itemId}
                  className="grid min-w-0 gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <ItemImage itemId={item.id} />
                    <span className="min-w-0 flex-1 font-medium">
                      {item.name}
                    </span>
                    <Button
                      aria-label={`Remove ${item.name}`}
                      disabled={outputs.length === 1}
                      onClick={() => {
                        setOutputs((current) =>
                          current.filter((entry) => entry.itemId !== item.id),
                        );
                        pin(item.id, "");
                      }}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-end gap-3">
                    <label className="grid gap-1 text-muted-foreground">
                      {item.form === "solid" ? "Items/min" : "m³/min"}
                      <Input
                        aria-label={`${item.name} rate`}
                        autoFocus={index === 0}
                        min="0.000001"
                        required
                        step="any"
                        type="number"
                        value={output.rate}
                        onChange={(event) =>
                          setOutputs((current) =>
                            current.map((entry) =>
                              entry.itemId === item.id
                                ? { ...entry, rate: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="grid min-w-0 gap-1 text-muted-foreground">
                      Recipe
                      <select
                        aria-label={`${item.name} recipe`}
                        className={selectClass}
                        value={pinnedRecipes[item.id] ?? ""}
                        onChange={(event) => pin(item.id, event.target.value)}
                      >
                        <option value="">Automatic</option>
                        {recipesProducing(item.id).map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.name}
                            {recipe.alternate ? " (Alternate)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
            {addingOutput ? (
              <div className="grid gap-2 rounded-lg border border-border p-3">
                <Input
                  aria-label="Search output items"
                  autoFocus
                  placeholder="Search items to produce…"
                  value={outputSearch}
                  onChange={(event) => setOutputSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (availableOutputs[0]) {
                        setOutputs((current) => [
                          ...current,
                          { itemId: availableOutputs[0].id, rate: "10" },
                        ]);
                        setAddingOutput(false);
                        setOutputSearch("");
                      }
                    }
                  }}
                />
                <div className="grid max-h-44 overflow-y-auto">
                  {availableOutputs.map((item) => (
                    <Button
                      className="justify-start"
                      key={item.id}
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setOutputs((current) => [
                          ...current,
                          { itemId: item.id, rate: "10" },
                        ]);
                        setAddingOutput(false);
                        setOutputSearch("");
                      }}
                    >
                      <ItemImage itemId={item.id} />
                      {item.name}
                    </Button>
                  ))}
                  {!availableOutputs.length && (
                    <p className="py-2 text-muted-foreground">
                      No matching items.
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAddingOutput(false)}
                >
                  Cancel adding output
                </Button>
              </div>
            ) : (
              <Button
                className="justify-self-start"
                type="button"
                variant="outline"
                onClick={() => setAddingOutput(true)}
              >
                <Plus className="size-4" />
                Add another output
              </Button>
            )}
          </fieldset>
          <ResourceNodeFields
            disabled={busy}
            value={resourceNodes}
            onChange={(next) => {
              setResourceNodes(next);
              setError(null);
            }}
          />
          <fieldset disabled={busy} className="min-w-0 disabled:opacity-60">
            <details>
              <summary className="cursor-pointer font-medium">
                Alternative recipes
                {enabledAlternates.size > 0
                  ? ` · ${enabledAlternates.size} enabled`
                  : " · standard recipes by default"}
              </summary>
              <p className="mt-2 text-muted-foreground">
                Enabled alternatives get first consideration. “Required” fixes
                the recipe whenever its main output is needed; otherwise the
                planner chooses. Output recipe selections above are also
                required.
              </p>
              <Input
                aria-label="Search alternative recipes"
                className="my-3"
                placeholder="Search recipes or ingredients…"
                value={recipeSearch}
                onChange={(event) => setRecipeSearch(event.target.value)}
              />
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                {alternatives.map((recipe) => {
                  const output = recipe.outputs[0]!;
                  const required = pinnedRecipes[output.itemId] === recipe.id;
                  const enabled = allowedAlternateIds.includes(recipe.id);
                  return (
                    <div
                      className="flex items-center gap-3 rounded-md bg-muted/40 p-2"
                      key={recipe.id}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{recipe.name}</div>
                        <div className="text-[0.625rem] text-muted-foreground">
                          {recipe.inputs
                            .map((input) => findDescriptor(input.itemId)?.name)
                            .join(" + ")}
                        </div>
                      </div>
                      <select
                        aria-label={`${recipe.name} usage`}
                        className={`${selectClass} max-w-28`}
                        value={
                          required ? "required" : enabled ? "allowed" : "off"
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          setAllowedAlternateIds((current) =>
                            value === "off"
                              ? current.filter((id) => id !== recipe.id)
                              : [...new Set([...current, recipe.id])],
                          );
                          if (value === "required")
                            pin(output.itemId, recipe.id);
                          else if (required) pin(output.itemId, "");
                        }}
                      >
                        <option value="off">Off</option>
                        <option value="allowed">Allowed</option>
                        <option value="required">Required</option>
                      </select>
                    </div>
                  );
                })}
                {!alternatives.length && (
                  <p className="py-2 text-muted-foreground">
                    No matching alternative recipes.
                  </p>
                )}
              </div>
              {Object.entries(pinnedRecipes).length > 0 && (
                <p className="mt-2 text-muted-foreground">
                  Required:{" "}
                  {Object.values(pinnedRecipes)
                    .map((id) => findRecipe(id)?.name)
                    .join(", ")}
                </p>
              )}
            </details>
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {stage && (
            <div role="status" className="grid gap-2">
              <span>{stage}…</span>
              <progress
                aria-label={stage}
                className="h-1.5 w-full accent-primary"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button disabled={busy || !outputs.length} type="submit">
              <WandSparkles className="size-4" />
              {busy ? "Building…" : "Generate production plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
