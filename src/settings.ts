import { DEFAULT_MODEL } from "../shared/config";
import type { RequestMode, UserPrefs } from "../shared/types";

export interface AppSettings extends UserPrefs {
  token: string;
  /** Worker 주소. 비우면 빌드 시 VITE_API_BASE, 그것도 없으면 같은 도메인 */
  api_base: string;
  model: string;
  last_mode: RequestMode;
}

export const DEFAULT_SETTINGS: AppSettings = {
  allergies: [],
  dislikes: [],
  wine_prefs: {
    type: "레드",
    body: "풀바디 (4-5)",
    tannin: "타닌감 있음 (4-5)",
    finish: "목넘김이 부드러운 편 (거친 타닌·과한 산미는 비선호)",
    summary: "바디감 있고 타닌이 느껴지면서도 목넘김이 좋은 레드와인 선호",
  },
  sake_prefs: {
    sweetness: "달지 않음 (카라구치, 일본주도 + 쪽)",
    style: "깔끔하고 클래식한 스타일 (화려한 긴조향보다 쌀 맛 중심)",
    temperature: "데워 마시기 좋은 사케 (누루캉·아츠캉 적합)",
    summary: "달지 않고 깔끔하며 클래식한, 데워 마시기 좋은 사케 선호",
  },
  convert_to_krw: true,
  currency: "JPY",
  krw_rate: 9.3,
  token: "",
  api_base: "",
  model: DEFAULT_MODEL,
  last_mode: "menu",
};

// 원화 환산 기본값 (대략치 — 설정에서 수정하거나 '환율 불러오기'로 갱신)
export const CURRENCIES: { code: string; label: string; rate: number }[] = [
  { code: "JPY", label: "🇯🇵 엔 (JPY)", rate: 9.3 },
  { code: "USD", label: "🇺🇸 달러 (USD)", rate: 1390 },
  { code: "EUR", label: "🇪🇺 유로 (EUR)", rate: 1600 },
  { code: "GBP", label: "🇬🇧 파운드 (GBP)", rate: 1850 },
  { code: "CNY", label: "🇨🇳 위안 (CNY)", rate: 195 },
  { code: "TWD", label: "🇹🇼 대만달러 (TWD)", rate: 45 },
  { code: "HKD", label: "🇭🇰 홍콩달러 (HKD)", rate: 178 },
  { code: "THB", label: "🇹🇭 바트 (THB)", rate: 42 },
  { code: "VND", label: "🇻🇳 동 (VND)", rate: 0.053 },
  { code: "SGD", label: "🇸🇬 싱가포르달러 (SGD)", rate: 1070 },
  { code: "AUD", label: "🇦🇺 호주달러 (AUD)", rate: 910 },
  { code: "CHF", label: "🇨🇭 스위스프랑 (CHF)", rate: 1720 },
];

const KEY = "travel-lens:settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...saved,
      wine_prefs: { ...DEFAULT_SETTINGS.wine_prefs, ...saved.wine_prefs },
      sake_prefs: { ...DEFAULT_SETTINGS.sake_prefs, ...saved.sake_prefs },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패는 무시 (프라이빗 모드 등) */
  }
}

export function toUserPrefs(s: AppSettings): UserPrefs {
  return {
    allergies: s.allergies,
    dislikes: s.dislikes,
    wine_prefs: s.wine_prefs,
    sake_prefs: s.sake_prefs,
    convert_to_krw: s.convert_to_krw,
    currency: s.currency,
    krw_rate: s.krw_rate,
  };
}

export function apiBase(s: AppSettings): string {
  const base = s.api_base.trim() || (import.meta.env.VITE_API_BASE as string | undefined) || "";
  return base.replace(/\/+$/, "");
}
