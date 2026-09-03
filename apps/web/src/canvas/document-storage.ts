import type { CanvasDocument, CanvasEditor } from "./editor";
import { validateCanvasDocument } from "./document-format";

export type CanvasDocumentStorage = Readonly<{
  load: () => Promise<CanvasDocument | null>;
  save: (document: CanvasDocument) => Promise<void>;
}>;

const DATABASE_NAME = "satisfactory-belt";
const DOCUMENT_KEY = "autosave";
const STORE_NAME = "documents";

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

  return {
    async load() {
      const db = await database;
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(DOCUMENT_KEY);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          try {
            resolve(
              request.result === undefined
                ? null
                : validateCanvasDocument(request.result),
            );
          } catch (error) {
            reject(error);
          }
        };
      });
    },
    async save(document) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(document, DOCUMENT_KEY);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
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
    void storage.save(document).catch(onError);
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
