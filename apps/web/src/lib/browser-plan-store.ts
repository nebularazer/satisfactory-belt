import type { FactoryDocument } from "@satisfactory-belt/factory-core";

const DATABASE = "satisfactory-belt";
const STORE = "plans";
const CURRENT = "current";
const PLAN_VERSION = 2;

export interface PlanStore {
  load(): Promise<FactoryDocument | undefined>;
  save(document: FactoryDocument): Promise<void>;
  close(): void;
}

/** Transactions start immediately and IndexedDB serializes writes in edit order. */
export async function createBrowserPlanStore(
  factory: IDBFactory = window.indexedDB,
): Promise<PlanStore> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    let blocked = false;
    request.addEventListener("upgradeneeded", () => request.result.createObjectStore(STORE));
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () => {
      blocked = true;
      reject(new Error("Close other Satisfactory Belt tabs and reload to open the saved plan."));
    });
    request.addEventListener("success", () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    });
  });
  database.addEventListener("versionchange", () => database.close());

  function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.addEventListener("complete", () => resolve(request.result));
      tx.addEventListener("abort", () =>
        reject(tx.error ?? request.error ?? new Error("Plan storage was interrupted.")),
      );
      tx.addEventListener("error", () => reject(tx.error ?? request.error));
    });
  }

  return {
    async load() {
      const saved: unknown = await transaction("readonly", (store) => store.get(CURRENT));
      if (saved === undefined) return undefined;
      // Pre-release formats are intentionally not migrated.
      if (
        saved &&
        typeof saved === "object" &&
        "version" in saved &&
        saved.version !== PLAN_VERSION
      )
        return undefined;
      if (
        !saved ||
        typeof saved !== "object" ||
        !("version" in saved) ||
        saved.version !== PLAN_VERSION ||
        !("document" in saved) ||
        !saved.document ||
        typeof saved.document !== "object" ||
        !("nodes" in saved.document) ||
        !Array.isArray(saved.document.nodes) ||
        !("links" in saved.document) ||
        !Array.isArray(saved.document.links)
      )
        throw new Error("The saved plan could not be read. It has not been overwritten.");
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Versioned, app-owned records; editor construction resolves the document against the current game catalog before autosave starts.
      return saved.document as FactoryDocument;
    },
    async save(document) {
      await transaction("readwrite", (store) =>
        store.put({ version: PLAN_VERSION, document }, CURRENT),
      );
    },
    close: () => database.close(),
  };
}
