import type { EditHistory } from "@satisfactory-belt/edit-history";
import type { FactoryDocument } from "@satisfactory-belt/factory-core";

import type { PlanStore } from "./browser-plan-store";

/** Save document commits, never transient pointer movement, selection, or camera changes. */
export function startPlanAutosave(
  history: EditHistory<FactoryDocument>,
  store: Pick<PlanStore, "save">,
  onStatus: (error: string | null) => void,
) {
  let active = true;
  let revision = 0;
  function save() {
    const saving = ++revision;
    void store.save(history.getSnapshot().state).then(
      () => {
        if (active && saving === revision) onStatus(null);
      },
      () => {
        if (active && saving === revision)
          onStatus(
            "Your latest changes could not be saved. Keep this tab open and try another edit.",
          );
      },
    );
  }
  const unsubscribe = history.subscribe(save);
  save();
  return () => {
    active = false;
    unsubscribe();
  };
}
