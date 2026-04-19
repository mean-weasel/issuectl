export type QueueableAction = "assignDraft" | "addComment" | "toggleLabel";

export type QueuedOperation = {
  id: string;
  action: QueueableAction;
  params: Record<string, unknown>;
  nonce: string;
  status: "pending" | "syncing" | "failed";
  error: string | null;
  createdAt: number;
  attemptedAt: number | null;
};

const DB_NAME = "issuectl-offline";
const STORE_NAME = "queued-ops";
const DB_VERSION = 1;

let _seq = 0;
function monotonicNow(): number {
  const now = Date.now();
  _seq++;
  return now * 1000 + (_seq % 1000);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      }),
  );
}

function getAllFromStore(): Promise<QueuedOperation[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      }),
  );
}

export async function enqueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  nonce: string,
): Promise<QueuedOperation> {
  const op: QueuedOperation = {
    id: crypto.randomUUID(),
    action,
    params,
    nonce,
    status: "pending",
    error: null,
    createdAt: monotonicNow(),
    attemptedAt: null,
  };
  await withStore("readwrite", (store) => store.put(op));
  return op;
}

export async function listPending(): Promise<QueuedOperation[]> {
  const all = await getAllFromStore();
  return all
    .filter((op) => op.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listFailed(): Promise<QueuedOperation[]> {
  const all = await getAllFromStore();
  return all.filter((op) => op.status === "failed");
}

export async function listAll(): Promise<QueuedOperation[]> {
  const all = await getAllFromStore();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function markSyncing(id: string): Promise<void> {
  const all = await getAllFromStore();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.status = "syncing";
  op.attemptedAt = Date.now();
  await withStore("readwrite", (store) => store.put(op));
}

export async function markFailed(id: string, error: string): Promise<void> {
  const all = await getAllFromStore();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.status = "failed";
  op.error = error;
  op.attemptedAt = Date.now();
  await withStore("readwrite", (store) => store.put(op));
}

export async function markPending(id: string): Promise<void> {
  const all = await getAllFromStore();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.status = "pending";
  await withStore("readwrite", (store) => store.put(op));
}

export async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function clearAll(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}
