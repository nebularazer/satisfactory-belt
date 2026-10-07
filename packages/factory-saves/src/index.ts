import type { FactoryDocument } from "@satisfactory-belt/factory-core";

const STORE = "plans";
const DETAILS = "factory-details";
const CURRENT = "current";
const ACTIVE = "active-factory";
const PLAN_VERSION = 2;

export interface FactorySave {
  id: string;
  name: string;
  updatedAt: number;
}

export interface SavedFactory extends FactorySave {
  document: FactoryDocument;
}

export interface FactoryStore {
  list(): Promise<FactorySave[]>;
  load(id: string): Promise<SavedFactory | undefined>;
  loadActive(): Promise<SavedFactory | undefined>;
  select(id: string): Promise<void>;
  create(name: string, document: FactoryDocument): Promise<FactorySave>;
  save(id: string, document: FactoryDocument): Promise<void>;
  delete(id: string): Promise<void>;
  close(): void;
}

function readDetails(value: unknown): FactorySave {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !("updatedAt" in value) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  )
    throw new Error("The saved factory details could not be read.");
  return { id: value.id, name: value.name, updatedAt: value.updatedAt };
}

function readFactory(value: unknown, id: string): SavedFactory | undefined {
  if (value === undefined) return undefined;
  if (value && typeof value === "object" && "version" in value && value.version !== PLAN_VERSION)
    return undefined;
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== PLAN_VERSION ||
    !("document" in value) ||
    !value.document ||
    typeof value.document !== "object" ||
    !("nodes" in value.document) ||
    !Array.isArray(value.document.nodes) ||
    !("links" in value.document) ||
    !Array.isArray(value.document.links)
  )
    throw new Error("The saved factory could not be read. It has not been overwritten.");
  // The existing single autosave becomes a named factory on its next edit.
  const name = "name" in value ? value.name : "Factory 1";
  const updatedAt = "updatedAt" in value ? value.updatedAt : 0;
  const details = readDetails({ id, name, updatedAt });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Versioned app records; the editor validates against the game catalog before autosave starts.
  return { ...details, document: value.document as FactoryDocument };
}

/** IndexedDB serializes transactions, including pending edits before load, copy and deletion. */
export async function createFactoryStore(
  factory: IDBFactory,
  databaseName: string,
): Promise<FactoryStore> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 2);
    let blocked = false;
    request.addEventListener("upgradeneeded", () => {
      const upgrading = request.result;
      if (!upgrading.objectStoreNames.contains(STORE)) upgrading.createObjectStore(STORE);
      const details = upgrading.createObjectStore(DETAILS);
      const cursor = request.transaction!.objectStore(STORE).openCursor();
      cursor.addEventListener("success", () => {
        const entry = cursor.result;
        if (!entry) return;
        try {
          if (
            typeof entry.key === "string" &&
            (entry.key === CURRENT || entry.key.startsWith("factory:"))
          ) {
            const saved = readFactory(entry.value, entry.key);
            if (saved)
              details.put({ id: saved.id, name: saved.name, updatedAt: saved.updatedAt }, saved.id);
          }
          entry.continue();
        } catch (error) {
          reject(error);
          request.transaction!.abort();
        }
      });
    });
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () => {
      blocked = true;
      reject(new Error("Close other Satisfactory Belt tabs and reload to open saved factories."));
    });
    request.addEventListener("success", () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    });
  });
  database.addEventListener("versionchange", () => database.close());

  function transaction<T, R>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, details: IDBObjectStore) => IDBRequest<T>,
    read: (value: T, store: IDBObjectStore, details: IDBObjectStore) => R,
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORE, DETAILS], mode);
      const objectStore = tx.objectStore(STORE);
      const details = tx.objectStore(DETAILS);
      let result: R;
      tx.addEventListener("complete", () => resolve(result));
      tx.addEventListener("abort", () =>
        reject(tx.error ?? new Error("Factory storage was interrupted.")),
      );
      tx.addEventListener("error", () => reject(tx.error));
      try {
        const request = run(objectStore, details);
        request.addEventListener("success", () => {
          try {
            result = read(request.result, objectStore, details);
          } catch (error) {
            reject(error);
            tx.abort();
          }
        });
      } catch (error) {
        reject(error);
        tx.abort();
      }
    });
  }

  const store: FactoryStore = {
    list() {
      return transaction(
        "readonly",
        (_objectStore, details) => details.getAll(),
        (values: unknown[]) =>
          values
            .map(readDetails)
            .toSorted((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)),
      );
    },
    load(id) {
      return transaction(
        "readonly",
        (objectStore) => objectStore.get(id),
        (value: unknown) => readFactory(value, id),
      );
    },
    async loadActive() {
      const id: unknown = await transaction(
        "readonly",
        (objectStore) => objectStore.get(ACTIVE),
        (value: unknown) => value,
      );
      const active =
        id === null ? undefined : await store.load(typeof id === "string" ? id : CURRENT);
      if (active) return active;
      const [latest] = await store.list();
      return latest ? store.load(latest.id) : undefined;
    },
    select(id) {
      return transaction(
        "readwrite",
        (objectStore) => objectStore.get(id),
        (value: unknown, objectStore) => {
          if (!readFactory(value, id)) throw new Error("This factory is no longer saved.");
          objectStore.put(id, ACTIVE);
        },
      );
    },
    async create(name, document) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Enter a factory name.");
      const saved = { id: `factory:${crypto.randomUUID()}`, name: trimmed, updatedAt: Date.now() };
      await transaction(
        "readwrite",
        (objectStore, details) => {
          details.add(saved, saved.id);
          const request = objectStore.add({ ...saved, version: PLAN_VERSION, document }, saved.id);
          objectStore.put(saved.id, ACTIVE);
          return request;
        },
        () => undefined,
      );
      return saved;
    },
    save(id, document) {
      return transaction(
        "readwrite",
        (objectStore) => objectStore.get(id),
        (value: unknown, objectStore, details) => {
          const saved = readFactory(value, id);
          if (!saved)
            throw new Error(
              "This factory is no longer saved. Use Save as new to keep your changes.",
            );
          const updated = { id, name: saved.name, updatedAt: Date.now() };
          objectStore.put({ ...updated, document, version: PLAN_VERSION }, id);
          details.put(updated, id);
        },
      );
    },
    delete(id) {
      return transaction(
        "readwrite",
        (objectStore) => objectStore.get(ACTIVE),
        (active: unknown, objectStore, details) => {
          objectStore.delete(id);
          details.delete(id);
          if (active === id || (active === undefined && id === CURRENT))
            objectStore.put(null, ACTIVE);
        },
      );
    },
    close: () => database.close(),
  };
  return store;
}
