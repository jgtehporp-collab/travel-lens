import type { RequestMode } from "../shared/types";
import { ApiError, analyze } from "./api";
import { type Scan, getScan, putScan, updateScan } from "./db";
import { processImage } from "./image";
import { MODE_META, summarize } from "./render";
import { loadSettings } from "./settings";
import { toast, uid } from "./util";

export const SCAN_UPDATED = "scan-updated";
const inflight = new Set<string>();

function notify(id: string): void {
  window.dispatchEvent(new CustomEvent(SCAN_UPDATED, { detail: id }));
}

export function isInflight(id: string): boolean {
  return inflight.has(id);
}

export async function startScan(file: File, mode: RequestMode): Promise<void> {
  let img;
  try {
    img = await processImage(file);
  } catch {
    toast("이미지를 읽을 수 없어요. 다른 사진으로 시도해 주세요");
    return;
  }
  const scan: Scan = {
    id: uid(),
    createdAt: Date.now(),
    requestedMode: mode,
    mode: mode === "auto" ? null : mode,
    image: img.dataUrl,
    thumb: img.thumb,
    status: "pending",
    result: null,
    error: null,
    title: mode === "auto" ? "자동 감지" : MODE_META[mode].label,
    subtitle: "",
    rating: 0,
    memo: "",
  };
  await putScan(scan);
  location.hash = `#/scan/${scan.id}`;
  await runScan(scan.id);
}

export async function runScan(id: string): Promise<void> {
  const scan = await getScan(id);
  if (!scan || inflight.has(id)) return;
  inflight.add(id);
  await updateScan(id, { status: "pending", error: null });
  notify(id);
  try {
    const base64 = scan.image.slice(scan.image.indexOf(",") + 1);
    const res = await analyze(loadSettings(), { mode: scan.requestedMode, image: base64 });
    const { title, subtitle } = res.data ? summarize(res.mode, res.data) : { title: MODE_META[res.mode].label, subtitle: "원문 응답" };
    await updateScan(id, { status: "done", result: res, mode: res.mode, title, subtitle });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "알 수 없는 오류가 발생했어요";
    await updateScan(id, { status: "error", error: msg });
  } finally {
    inflight.delete(id);
    notify(id);
  }
}
