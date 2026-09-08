import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEFAULT_LOGISTICS_TIERS } from "@satisfactory-belt/planning";
import {
  conversionStages,
  defaultConversionSettings,
  type ConversionSettings,
  type ConversionStage,
} from "@/detailed-conversion/convert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type Props = {
  sourceName?: string;
  onClose: () => void;
  onCreate: (
    settings: ConversionSettings,
    name: string,
    signal: AbortSignal,
    onStage: (stage: ConversionStage) => void,
  ) => Promise<void>;
};

export function CreateDetailedDialog({ sourceName, onClose, onCreate }: Props) {
  const [name, setName] = useState(sourceName ?? "My factory");
  const [settings, setSettings] = useState(defaultConversionSettings);
  const [stage, setStage] = useState<ConversionStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const saving = stage === "Saving plan";
  const close = () => {
    if (savingRef.current) return;
    controller.current?.abort();
    onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setStage("Expanding machines");
    setError(null);
    try {
      await onCreate(settings, name.trim(), abort.signal, (next) => {
        savingRef.current = next === "Saving plan";
        setStage(next);
      });
      if (!abort.signal.aborted) onClose();
    } catch (error) {
      if (!abort.signal.aborted)
        setError(error instanceof Error ? error.message : "Conversion failed.");
    } finally {
      if (!abort.signal.aborted) setStage(null);
      controller.current = null;
      savingRef.current = false;
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
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        aria-busy={stage !== null}
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>Create Detailed plan</DialogTitle>
          <DialogDescription>
            Expand your Basic plan into individual machines, equal-split
            balancers, and an arranged factory. Choose the fastest belts and
            pipes you can build.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <fieldset
            disabled={stage !== null}
            className="grid gap-4 disabled:opacity-60"
          >
            {!sourceName && (
              <label className="grid gap-1">
                Plan name
                <Input
                  autoFocus
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
              </label>
            )}
            {(["conveyor", "pipeline"] as const).map((medium) => {
              const key =
                medium === "conveyor" ? "conveyorTierId" : "pipelineTierId";
              return (
                <label key={medium} className="grid gap-1 font-medium">
                  Maximum {medium === "conveyor" ? "conveyor" : "pipeline"}{" "}
                  speed
                  <select
                    className="h-9 w-full rounded-md border border-input bg-popover px-2 text-popover-foreground"
                    value={settings[key]}
                    onChange={(event) => {
                      setSettings((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }));
                      setError(null);
                    }}
                  >
                    {DEFAULT_LOGISTICS_TIERS.filter(
                      (tier) => tier.medium === medium,
                    ).map((tier, index) => (
                      <option key={tier.id} value={tier.id}>
                        Mk.{index + 1} · {tier.capacityPerMinute}{" "}
                        {medium === "conveyor" ? "items/min" : "m³/min"}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <p className="text-muted-foreground">
              Shared conveyor supply is divided into parallel balanced lines.
              Each machine’s individual port must still fit the selected speed.
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {stage && (
            <div role="status" className="grid gap-2">
              <span>
                {stage}…{" "}
                <span className="text-muted-foreground">
                  Step {conversionStages.indexOf(stage) + 1} of{" "}
                  {conversionStages.length}
                </span>
              </span>
              <div
                role="progressbar"
                aria-label="Detailed plan creation"
                aria-valuetext={stage}
                aria-valuemin={0}
                aria-valuemax={conversionStages.length}
                aria-valuenow={conversionStages.indexOf(stage)}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{
                    width: `${(100 * conversionStages.indexOf(stage)) / conversionStages.length}%`,
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={saving}
              type="button"
              variant="outline"
              onClick={close}
            >
              Cancel
            </Button>
            <Button disabled={stage !== null || !name.trim()} type="submit">
              {stage ? "Creating…" : "Create Detailed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
