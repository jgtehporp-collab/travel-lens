import type { AnalyzeResponse, Mode, RequestMode } from "../shared/types";

export interface Scan {
  id: string;
  createdAt: number;
  requestedMode: RequestMode;
  /** 결과가 나온 뒤 확정된 모드 */
  mode: Mode | null;
  /** 기록용 썸네일 data URL. 원본 사진은 저장하지 않는다 (해석 중에만 메모리에 보관) */
  thumb: string;
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
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion < 1) {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (e.oldVersion >= 1 && e.oldVersion < 2) {
        // v1은 원본 사진(image)도 저장했음 → 지워서 용량 확보
        const cursorReq = req.transaction!.objectStore(STORE).openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const { image: _drop, ...rest } = cursor.value as Scan & { image?: string };
          cursor.update(rest);
          cursor.continue();
        };
      }
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
