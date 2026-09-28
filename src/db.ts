import type { AnalyzeResponse, Mode, RequestMode } from "../shared/types";

export interface Scan {
  id: string;
  createdAt: number;
  requestedMode: RequestMode;
  /** 결과가 나온 뒤 확정된 모드 */
  mode: Mode | null;
  image: string; // data URL (리사이즈된 JPEG)
  thumb: string; // data URL
  status: "pending" | "done" | "error";
  result: AnalyzeResponse | null;
  error: string | null;
  title: string;
  subtitle: string;
  rating: number; // 0 = 없음, 1~5
  memo: string;
}

const DB_NAME = "travel-lens";
const STORE = "scans";
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
      }),
  );
}

export const putScan = (scan: Scan) => tx("readwrite", (s) => s.put(scan)).then(() => undefined);
export const getScan = (id: string) => tx<Scan | undefined>("readonly", (s) => s.get(id));
export const deleteScan = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => undefined);

export async function listScans(): Promise<Scan[]> {
  const all = await tx<Scan[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateScan(id: string, patch: Partial<Scan>): Promise<Scan | undefined> {
  const cur = await getScan(id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  await putScan(next);
  return next;
}
