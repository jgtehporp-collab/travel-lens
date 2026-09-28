import type { MenuResult, Mode, SakeResult, WineResult } from "../shared/types.js";

// MOCK=true 일 때 돌려주는 샘플 결과 (API 비용 없이 UI 확인용)
const menu: MenuResult = {
  restaurant_type: "이자카야",
  language: "일본어",
  items: [
    {
      original: "焼き鳥盛り合わせ",
      reading: "야키토리 모리아와세",
      korean_name: "꼬치구이 모둠",
      description: "닭고기 부위별 꼬치를 숯불에 구워 5~6개 담아내는 모둠.",
      taste: "짭짤한 타레 또는 소금 간, 숯향이 진함",
      price: "¥980",
      price_krw: "약 9,100원",
      tags: ["대표메뉴", "닭고기"],
      warnings: [],
      confidence: "high",
    },
    {
      original: "だし巻き玉子",
      reading: "다시마키 타마고",
      korean_name: "다시 계란말이",
      description: "가다랑어 육수를 넣어 촉촉하게 만 일본식 계란말이.",
      taste: "은은한 단맛과 감칠맛, 부드러움",
      price: "¥580",
      price_krw: "약 5,400원",
      tags: ["추천", "계란"],
      warnings: ["계란 사용"],
      confidence: "high",
    },
    {
      original: "〆鯖",
      reading: "시메사바",
      korean_name: "초절임 고등어",
      description: "소금과 식초로 절인 고등어회.",
      taste: "새콤하고 기름진 고등어 맛",
      price: "¥680",
      price_krw: "약 6,300원",
      tags: ["해산물", "사케 안주"],
      warnings: ["생선(고등어) — 등푸른 생선 알레르기 주의"],
      confidence: "medium",
    },
    {
      original: "菊正宗 上撰 (熱燗)",
      reading: "기쿠마사무네 조센 (아츠캉)",
      korean_name: "기쿠마사무네 본양조 따뜻하게",
      description: "고베 나다 지역의 대표적인 카라구치 사케를 데워 제공.",
      taste: "드라이하고 깔끔, 데우면 쌀 감칠맛이 살아남",
      price: "¥650 (1合)",
      price_krw: "약 6,000원",
      tags: ["사케", "카라구치", "데움"],
      warnings: [],
      confidence: "high",
    },
  ],
  recommendations: [
    { original: "焼き鳥盛り合わせ", reason: "이 가게 대표 메뉴이고 사케 안주로 무난" },
    { original: "菊正宗 上撰 (熱燗)", reason: "달지 않은 클래식 카라구치, 데워 마시기 좋아 선호와 잘 맞음" },
  ],
  ordering_tips: "자리값(오토시) 300~500엔이 붙을 수 있어요. 첫 주문은 음료부터 하는 게 일반적입니다.",
  staff_phrases: {
    order: "これをください",
    allergy_notice: null,
  },
};

const wine: WineResult = {
  producer: "Château Musar",
  wine_name: "Château Musar Rouge",
  vintage: "2016",
  country: "레바논",
  region: "베카 밸리",
  appellation_level: "등급 표기 없음",
  grapes: ["카베르네 소비뇽", "생소", "카리냥"],
  type: "레드",
  label_terms: [{ term: "Mis en bouteille au Château", meaning: "샤토에서 직접 병입" }],
  expected_style: { body: 4, acidity: 3, tannin: 4, sweetness: 1 },
  tasting_notes: "말린 체리, 가죽, 향신료, 숙성에서 오는 흙내음. 타닌은 단단하지만 숙성으로 둥글어짐.",
  food_pairing: ["양갈비", "숙성 치즈", "스테이크"],
  drinking_window: "지금 마시기 좋음 (디캔팅 권장), 2030년대까지 보관 가능",
  match_with_user: "잘 맞음 — 풀바디에 타닌감이 있으면서 숙성으로 목넘김이 부드러운 스타일",
  confidence: "medium",
};

const sake: SakeResult = {
  brewery: "大七酒造 (다이시치 주조)",
  brand: "大七 生酛 純米 (다이시치 기모토 준마이)",
  prefecture: "후쿠시마현",
  classification: "준마이 (기모토 제법)",
  classification_meaning: "쌀·누룩·물만으로 빚은 순미주. 기모토는 자연 유산균으로 주모를 만드는 전통 제법.",
  specs: {
    seimaibuai: "69%",
    nihonshudo: "+3",
    acidity: "1.6",
    alcohol: "15%",
    rice: null,
    yeast: null,
  },
  processing: [{ term: "生酛 (기모토)", meaning: "전통 방식 주모. 감칠맛과 산미가 두텁고 데웠을 때 맛이 잘 살아남" }],
  label_terms: [{ term: "純米", meaning: "쌀과 누룩만 사용 (양조 알코올 무첨가)" }],
  expected_style: { dry_sweet: 2, light_rich: 4, aroma: "쌀향·숙성향" },
  serving_temp: "누루캉(40°C)~아츠캉(50°C)",
  food_pairing: ["야키토리(타레)", "생선조림", "오뎅"],
  match_with_user: "잘 맞음 — 달지 않은 클래식 기모토 준마이로 데워 마시기 최적",
  confidence: "high",
};

export function mockResult(mode: Mode): MenuResult | WineResult | SakeResult {
  return { menu, wine, sake }[mode];
}
