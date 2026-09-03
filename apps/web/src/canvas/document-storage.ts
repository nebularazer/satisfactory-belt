import type { CanvasDocument, CanvasEditor } from "./editor";
import { validateCanvasDocument } from "./document-format";

export type SavedCanvasDocument = Readonly<{
  document: CanvasDocument;
  id: string;
  name: string;
  updatedAt: string;
}>;

export type CanvasWorkspaceSnapshot = Readonly<{
  activeSave: SavedCanvasDocument | null;
  document: CanvasDocument | null;
}>;

export type SaveCanvasDocumentRequest = Readonly<{
  document: CanvasDocument;
  id?: string;
  name?: string;
}>;

export type CanvasDocumentStorage = Readonly<{
  deleteNamed: (id: string) => Promise<void>;
  listNamed: () => Promise<readonly SavedCanvasDocument[]>;
  loadWorkspace: () => Promise<CanvasWorkspaceSnapshot>;
  saveWorkspace: (
    document: CanvasDocument,
    activeSaveId: string | null,
  ) => Promise<void>;
  saveNamed: (
    request: SaveCanvasDocumentRequest,
  ) => Promise<SavedCanvasDocument>;
}>;

const DATABASE_NAME = "satisfactory-belt";
const AUTOSAVE_KEY = "autosave";
const ACTIVE_SAVE_KEY = "active-save";
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

  const writeWorkspace = async (
    document: CanvasDocument,
    activeSaveId: string | null,
  ): Promise<void> => {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put(document, AUTOSAVE_KEY);
      store.put(activeSaveId, ACTIVE_SAVE_KEY);
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
    async loadWorkspace() {
      const documentValue = await read(AUTOSAVE_KEY);
      const activeSaveId = await read(ACTIVE_SAVE_KEY);
      const document =
        documentValue === undefined
          ? null
          : validateCanvasDocument(documentValue);
      if (typeof activeSaveId !== "string") {
        return { activeSave: null, document };
      }

      const activeSave = readStoredNamedDocument(
        await read(`${NAMED_SAVE_PREFIX}${activeSaveId}`),
      );
      return { activeSave, document };
    },
    async saveWorkspace(document, activeSaveId) {
      await writeWorkspace(document, activeSaveId);
    },
    async saveNamed({ document, id = crypto.randomUUID(), name }) {
      const existing = readStoredNamedDocument(
        await read(`${NAMED_SAVE_PREFIX}${id}`),
      );
      const normalizedName = name?.trim() ?? existing?.name;
      if (!normalizedName) {
        throw new Error("A saved plan needs a name.");
      }
      const stored: StoredNamedDocument = {
        document,
        id,
        kind: "named",
        name: normalizedName,
        updatedAt: new Date().toISOString(),
      };
      const db = await database;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put(stored, `${NAMED_SAVE_PREFIX}${id}`);
        store.put(document, AUTOSAVE_KEY);
        store.put(id, ACTIVE_SAVE_KEY);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
      return readStoredNamedDocument(stored)!;
    },
  };
}

export function attachCanvasAutosave(
  editor: CanvasEditor,
  storage: CanvasDocumentStorage,
  getActiveSaveId: () => string | null,
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
    void storage.saveWorkspace(document, getActiveSaveId()).catch(onError);
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
