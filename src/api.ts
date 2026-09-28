import type { AnalyzeRequest, AnalyzeResponse, RateResponse } from "../shared/types";
import { type AppSettings, CURRENCIES, loadSettings, saveSettings, toUserPrefs } from "./settings";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(settings: AppSettings, path: string, init: RequestInit = {}): Promise<T> {
  if (!settings.token) throw new ApiError(401, "설정에서 접근 토큰을 먼저 입력해 주세요");
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", "X-App-Token": settings.token, ...init.headers },
    });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    const fallback = res.status === 413 ? "사진 용량이 너무 커요" : `요청 실패 (${res.status})`;
    throw new ApiError(res.status, data?.error ?? fallback);
  }
  return data;
}

export function analyze(
  settings: AppSettings,
  req: Pick<AnalyzeRequest, "mode" | "image">,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  const body: AnalyzeRequest = {
    mode: req.mode,
    image: req.image,
    media_type: "image/jpeg",
    prefs: toUserPrefs(settings),
    model: settings.model,
  };
  return request<AnalyzeResponse>(settings, "/api/analyze", { method: "POST", body: JSON.stringify(body), signal });
}

/** 한국수출입은행 매매기준율 (서버 경유) */
export function fetchKrwRate(settings: AppSettings, currency: string): Promise<RateResponse> {
  return request<RateResponse>(settings, `/api/rate?currency=${encodeURIComponent(currency)}`);
}

const AUTO_RATE_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** 앱 실행 시 조용히 환율 갱신 (12시간에 한 번, 실패해도 무시) */
export async function refreshRateIfStale(): Promise<void> {
  const s = loadSettings();
  const supported = CURRENCIES.find((c) => c.code === s.currency)?.eximSupported !== false;
  if (!s.token || !s.convert_to_krw || !supported) return;
  if (Date.now() - s.krw_rate_checked_at < AUTO_RATE_INTERVAL_MS) return;
  try {
    const r = await fetchKrwRate(s, s.currency);
    const latest = loadSettings();
    if (latest.currency !== r.currency) return;
    saveSettings({ ...latest, krw_rate: r.rate, krw_rate_date: r.date, krw_rate_source: r.source, krw_rate_checked_at: Date.now() });
  } catch {
    /* 키가 없거나 네트워크 오류면 기존 값 유지 */
  }
}
