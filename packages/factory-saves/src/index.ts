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
  overwrite(id: string, document: FactoryDocument): Promise<FactorySave>;
  rename(id: string, name: string): Promise<FactorySave>;
  delete(id: string): Promise<void>;
  close(): void;
}

export function findFactoryByName(
  saves: readonly FactorySave[],
  name: string,
): FactorySave | undefined {
  const trimmed = name.trim();
  return saves.find((saved) => saved.name === trimmed);
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
    read: (
      value: T,
      store: IDBObjectStore,
      details: IDBObjectStore,
      abort: (reason: unknown) => void,
    ) => R,
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction([STORE, DETAILS], mode);
      const objectStore = tx.objectStore(STORE);
      const details = tx.objectStore(DETAILS);
      let result: R;
      const abort = (reason: unknown) => {
        reject(reason);
        tx.abort();
      };
      tx.addEventListener("complete", () => resolve(result));
      tx.addEventListener("abort", () =>
        reject(tx.error ?? new Error("Factory storage was interrupted.")),
      );
      tx.addEventListener("error", () => reject(tx.error));
      try {
        const request = run(objectStore, details);
        request.addEventListener("success", () => {
          try {
            result = read(request.result, objectStore, details, abort);
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

  function writeFactory(id: string, document: FactoryDocument, select: boolean) {
    return transaction(
      "readwrite",
      (objectStore) => objectStore.get(id),
      (value: unknown, objectStore, details) => {
        const saved = readFactory(value, id);
        if (!saved)
          throw new Error("This factory is no longer saved. Use Save as… to keep your changes.");
        const updated = { id, name: saved.name, updatedAt: Date.now() };
        objectStore.put({ ...updated, document, version: PLAN_VERSION }, id);
        details.put(updated, id);
        if (select) objectStore.put(id, ACTIVE);
        return updated;
      },
    );
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
        (_objectStore, details) => details.getAll(),
        (values: unknown[], objectStore, details) => {
          if (findFactoryByName(values.map(readDetails), trimmed))
            throw new Error(
              `A factory named “${trimmed}” already exists. Save to that name to overwrite it.`,
            );
          details.add(saved, saved.id);
          objectStore.add({ ...saved, version: PLAN_VERSION, document }, saved.id);
          objectStore.put(saved.id, ACTIVE);
        },
      );
      return saved;
    },
    async save(id, document) {
      await writeFactory(id, document, false);
    },
    overwrite: (id, document) => writeFactory(id, document, true),
    rename(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return Promise.reject(new Error("Enter a factory name."));
      return transaction(
        "readwrite",
        (_objectStore, details) => details.getAll(),
        (values: unknown[], objectStore, details, abort) => {
          const saves = values.map(readDetails);
          const saved = saves.find((entry) => entry.id === id);
          if (!saved) throw new Error("This factory is no longer saved.");
          const existing = findFactoryByName(saves, trimmed);
          if (existing && existing.id !== id)
            throw new Error(`A factory named “${trimmed}” already exists. Choose another name.`);
          const updated = { ...saved, name: trimmed };
          const request = objectStore.get(id);
          request.addEventListener("success", () => {
            try {
              const savedFactory = readFactory(request.result, id);
              if (!savedFactory) throw new Error("This factory is no longer saved.");
              objectStore.put(
                { ...updated, document: savedFactory.document, version: PLAN_VERSION },
                id,
              );
              details.put(updated, id);
            } catch (reason) {
              abort(reason);
            }
          });
          return updated;
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

export * from "./factory-json";
