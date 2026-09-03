import type { CanvasDocument, CanvasEditor } from "./editor";
import { validateCanvasDocument } from "./document-format";

export type SavedCanvasDocument = Readonly<{
  document: CanvasDocument;
  id: string;
  name: string;
  updatedAt: string;
}>;

export type CanvasDocumentStorage = Readonly<{
  deleteNamed: (id: string) => Promise<void>;
  listNamed: () => Promise<readonly SavedCanvasDocument[]>;
  loadAutosave: () => Promise<CanvasDocument | null>;
  saveAutosave: (document: CanvasDocument) => Promise<void>;
  saveNamed: (
    name: string,
    document: CanvasDocument,
    id?: string,
  ) => Promise<SavedCanvasDocument>;
}>;

const DATABASE_NAME = "satisfactory-belt";
const AUTOSAVE_KEY = "autosave";
const NAMED_SAVE_PREFIX = "save:";
const STORE_NAME = "documents";

type StoredNamedDocument = SavedCanvasDocument & Readonly<{
  kind: "named";
}>;

function readStoredNamedDocument(value: unknown): SavedCanvasDocument | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== "named" ||
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    candidate.name.trim().length === 0 ||
    typeof candidate.updatedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.updatedAt))
  ) {
    return null;
  }

  return {
    document: validateCanvasDocument(candidate.document),
    id: candidate.id,
    name: candidate.name,
    updatedAt: candidate.updatedAt,
  };
}

export function createIndexedDbDocumentStorage(
  factory: IDBFactory = globalThis.indexedDB,
): CanvasDocumentStorage {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

  const read = async (key: string): Promise<unknown> => {
    const db = await database;
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  const write = async (key: string, value: unknown): Promise<void> => {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  };

  return {
    async deleteNamed(id) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(`${NAMED_SAVE_PREFIX}${id}`);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
    },
    async listNamed() {
      const db = await database;
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      return values
        .map(readStoredNamedDocument)
        .filter((save): save is SavedCanvasDocument => save !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async loadAutosave() {
      const value = await read(AUTOSAVE_KEY);
      return value === undefined ? null : validateCanvasDocument(value);
    },
    async saveAutosave(document) {
      await write(AUTOSAVE_KEY, document);
    },
    async saveNamed(name, document, id = crypto.randomUUID()) {
      const normalizedName = name.trim();
      if (normalizedName.length === 0) {
        throw new Error("A saved plan needs a name.");
      }
      const stored: StoredNamedDocument = {
        document,
        id,
        kind: "named",
        name: normalizedName,
        updatedAt: new Date().toISOString(),
      };
      await write(`${NAMED_SAVE_PREFIX}${id}`, stored);
      return readStoredNamedDocument(stored)!;
    },
  };
}

export function attachCanvasAutosave(
  editor: CanvasEditor,
  storage: CanvasDocumentStorage,
  delay = 300,
  onError: (error: unknown) => void = console.error,
) {
  let pendingDocument: CanvasDocument | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (!pendingDocument) return;
    const document = pendingDocument;
    pendingDocument = undefined;
    if (timer) clearTimeout(timer);
    timer = undefined;
    void storage.saveAutosave(document).catch(onError);
  };

  const unsubscribe = editor.subscribe((change) => {
    if (change.kind !== "document") return;
    pendingDocument = editor.getState().document;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });
  window.addEventListener("pagehide", flush);

  return () => {
    unsubscribe();
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
