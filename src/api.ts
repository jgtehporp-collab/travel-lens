import type { AnalyzeRequest, AnalyzeResponse } from "../shared/types";
import { type AppSettings, apiBase, toUserPrefs } from "./settings";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function analyze(
  settings: AppSettings,
  req: Pick<AnalyzeRequest, "mode" | "image">,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  if (!settings.token) throw new ApiError(401, "설정에서 접근 토큰을 먼저 입력해 주세요");
  const body: AnalyzeRequest = {
    mode: req.mode,
    image: req.image,
    media_type: "image/jpeg",
    prefs: toUserPrefs(settings),
    model: settings.model,
  };
  let res: Response;
  try {
    res = await fetch(`${apiBase(settings)}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": settings.token },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없습니다. 네트워크나 Worker 주소를 확인하세요");
  }
  const data = (await res.json().catch(() => null)) as (AnalyzeResponse & { error?: string }) | null;
  if (!res.ok || !data) throw new ApiError(res.status, data?.error ?? `요청 실패 (${res.status})`);
  return data;
}

export async function fetchKrwRate(currency: string): Promise<number> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(currency)}`);
  if (!res.ok) throw new Error("환율 조회 실패");
  const data = (await res.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.KRW;
  if (!rate) throw new Error("원화 환율이 없습니다");
  return Math.round(rate * 1000) / 1000;
}
