export type Mode = "menu" | "wine" | "sake";
export type RequestMode = Mode | "auto";
export type Confidence = "high" | "medium" | "low";

export interface WinePrefs {
  type: string;
  body: string;
  tannin: string;
  finish: string;
  summary: string;
}

export interface SakePrefs {
  sweetness: string;
  style: string;
  temperature: string;
  summary: string;
}

/** 모델 프롬프트에 들어가는 사용자 선호 (토큰 등 비밀값 제외) */
export interface UserPrefs {
  allergies: string[];
  dislikes: string[];
  wine_prefs: WinePrefs;
  sake_prefs: SakePrefs;
  convert_to_krw: boolean;
  /** 여행 국가 통화 코드 (예: JPY) */
  currency: string;
  /** 1 단위 통화당 원화 (예: JPY → 9.3) */
  krw_rate: number | null;
}

export interface AnalyzeRequest {
  mode: RequestMode;
  image: string; // base64 (data: 접두어 없이)
  media_type: "image/jpeg" | "image/png" | "image/webp";
  prefs: UserPrefs;
  model?: string;
}

export interface AnalyzeResponse {
  mode: Mode;
  /** 파싱 성공 시 결과 JSON */
  data: MenuResult | WineResult | SakeResult | null;
  /** 파싱 실패 시 모델 원문 */
  raw: string | null;
  model: string;
}

export interface MenuItem {
  original: string;
  reading: string;
  korean_name: string;
  description: string;
  taste: string;
  price: string;
  price_krw: string | null;
  tags: string[];
  warnings: string[];
  confidence: Confidence;
}

export interface MenuResult {
  restaurant_type: string;
  language: string;
  items: MenuItem[];
  recommendations: { original: string; reason: string }[];
  ordering_tips: string;
  staff_phrases?: {
    order: string;
    allergy_notice: string | null;
  };
}

export interface TermMeaning {
  term: string;
  meaning: string;
}

export interface WineResult {
  producer: string;
  wine_name: string;
  vintage: string | null;
  country: string;
  region: string;
  appellation_level: string;
  grapes: string[];
  type: string;
  label_terms: TermMeaning[];
  expected_style: {
    body: string | number;
    acidity: string | number;
    tannin: string | number | null;
    sweetness: string | number;
  };
  tasting_notes: string;
  food_pairing: string[];
  drinking_window: string;
  match_with_user: string;
  confidence: Confidence;
}

export interface SakeResult {
  brewery: string;
  brand: string;
  prefecture: string;
  classification: string;
  classification_meaning: string;
  specs: {
    seimaibuai: string | null;
    nihonshudo: string | null;
    acidity: string | null;
    alcohol: string | null;
    rice: string | null;
    yeast: string | null;
  };
  processing: TermMeaning[];
  label_terms: TermMeaning[];
  expected_style: {
    dry_sweet: string | number;
    light_rich: string | number;
    aroma: string;
  };
  serving_temp: string;
  food_pairing: string[];
  match_with_user: string;
  confidence: Confidence;
}
