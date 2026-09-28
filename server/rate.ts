// 한국수출입은행 현재환율 API (https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2)
// - 인증키 필요 (KOREAEXIM_API_KEY), 하루 1000회 제한
// - 영업일 11시 전후 갱신. 주말·공휴일·11시 이전에는 빈 배열 → 최근 영업일로 거슬러 올라가 조회
import type { RateResponse } from "../shared/types.js";
import { HttpError, clientIp, env, handle, isMock, json, requireRateLimit, requireToken } from "./http.js";

const ENDPOINT = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";
const LOOKBACK_DAYS = 7;
const CACHE_MS = 60 * 60 * 1000;

// 수출입은행 통화코드와 다른 것 보정
const CODE_ALIAS: Record<string, string> = { CNY: "CNH" };

interface EximRow {
  result: number;
  cur_unit: string;
  cur_nm: string;
  deal_bas_r: string;
}

let cache: { at: number; date: string; rows: EximRow[] } | null = null;

function kstDate(offsetDays: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 - offsetDays * 86400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchRows(): Promise<{ date: string; rows: EximRow[] }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const key = env("KOREAEXIM_API_KEY");
  for (let i = 0; i <= LOOKBACK_DAYS; i++) {
    const date = kstDate(i);
    const url = `${ENDPOINT}?authkey=${encodeURIComponent(key)}&searchdate=${date}&data=AP01`;
    const res = await fetch(url, { redirect: "manual" });
    if (!res.ok) throw new HttpError(502, `수출입은행 API 오류 (${res.status})`);
    const rows = ((await res.json().catch(() => null)) ?? []) as EximRow[];
    if (!Array.isArray(rows) || rows.length === 0) continue; // 비영업일
    const code = rows[0].result;
    if (code === 3) throw new HttpError(502, "수출입은행 인증키가 올바르지 않거나 만료됐습니다");
    if (code === 4) throw new HttpError(503, "수출입은행 API 일일 호출 한도를 넘었습니다");
    if (code !== 1) throw new HttpError(502, `수출입은행 API 오류 (result ${code})`);
    cache = { at: Date.now(), date, rows };
    return cache;
  }
  throw new HttpError(502, "최근 영업일 환율을 찾지 못했습니다");
}

export async function lookupRate(currency: string): Promise<RateResponse> {
  const code = CODE_ALIAS[currency] ?? currency;
  if (isMock()) return { currency, rate: 9.5, date: kstDate(0), source: "mock" };
  const { date, rows } = await fetchRows();
  // "JPY(100)", "IDR(100)" 처럼 100단위 표기 통화는 1단위로 환산
  const row = rows.find((r) => r.cur_unit.replace(/\(\d+\)/, "") === code);
  if (!row) throw new HttpError(404, `수출입은행이 ${currency} 환율을 제공하지 않습니다. 직접 입력해 주세요`);
  const per = Number(row.cur_unit.match(/\((\d+)\)/)?.[1] ?? 1);
  const rate = Number(row.deal_bas_r.replace(/,/g, "")) / per;
  return { currency, rate: Math.round(rate * 1000) / 1000, date, source: "한국수출입은행 매매기준율" };
}

export const rateHandler = handle(async (req) => {
  if (req.method !== "GET") throw new HttpError(405, "GET만 허용됩니다");
  await requireToken(req);
  requireRateLimit(`rate:${clientIp(req)}`);
  if (!isMock() && !env("KOREAEXIM_API_KEY")) {
    throw new HttpError(501, "서버에 KOREAEXIM_API_KEY가 없어 환율 자동 조회를 쓸 수 없습니다. 직접 입력해 주세요");
  }
  const currency = (new URL(req.url).searchParams.get("currency") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "통화 코드가 올바르지 않습니다");
  return json(await lookupRate(currency));
});

export const healthHandler = handle(async () =>
  json({ ok: true, mock: isMock(), exchange_rate: isMock() || Boolean(env("KOREAEXIM_API_KEY")) }),
);
