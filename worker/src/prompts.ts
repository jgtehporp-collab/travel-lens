import type { Mode, UserPrefs } from "../../shared/types";

const SYSTEM_TEMPLATE = `너는 해외여행 중인 한국인을 돕는 음식·주류 전문 해설가다.
사진 속 텍스트를 읽고 한국어로 해석하되, 단순 번역이 아니라
"이게 뭔지, 어떤 맛인지, 주문할 만한지"를 알려준다.

규칙:
- 반드시 지정된 JSON 스키마로만 응답한다. JSON 밖에 다른 텍스트 금지.
- 사진에서 읽을 수 없거나 불확실한 정보는 추측하지 말고 confidence를 "low"로 표시한다.
- 가격은 원문 통화 그대로 적고, 사용자 설정에 환산 요청이 있으면 대략적인 원화를 병기하되 "약"을 붙인다.
- 사용자 선호/알레르기: {{USER_PREFS}}
  → 해당 재료가 들어갔을 가능성이 있으면 warnings에 명시한다.
- match_with_user는 사용자 선호와 비교해 "잘 맞음 / 보통 / 안 맞을 수 있음" 중 하나로 시작하고 이유를 한 줄 붙인다.
- 메뉴판에 와인·사케 리스트가 있으면 사용자 선호에 가장 가까운 것을 recommendations에 포함한다.
  (예: 사케는 혼조조·준마이·야마하이·기모토 계열의 카라구치, 와인은 풀바디 레드 위주)`;

export function buildSystemPrompt(prefs: UserPrefs): string {
  const conversion = prefs.convert_to_krw
    ? prefs.krw_rate
      ? `원화 환산 요청함 (기준 환율: 1 ${prefs.currency} ≈ ${prefs.krw_rate}원, 여행 통화 ${prefs.currency})`
      : `원화 환산 요청함 (여행 통화 ${prefs.currency}, 환율은 대략적인 최근 시세 사용)`
    : "원화 환산 요청 안 함 (price_krw는 null)";

  const prefsText = JSON.stringify(
    {
      allergies: prefs.allergies,
      dislikes: prefs.dislikes,
      wine_prefs: prefs.wine_prefs,
      sake_prefs: prefs.sake_prefs,
      price_conversion: conversion,
    },
    null,
    2,
  );
  return SYSTEM_TEMPLATE.replace("{{USER_PREFS}}", prefsText);
}

const MENU_SCHEMA = `{
  "restaurant_type": "string (예: 이자카야, 비스트로)",
  "language": "string",
  "items": [{
    "original": "원문",
    "reading": "발음 (한글 표기)",
    "korean_name": "한국어 이름",
    "description": "어떤 요리인지 1~2문장",
    "taste": "맛 특징 한 줄",
    "price": "원문 가격",
    "price_krw": "약 ○○원 | null",
    "tags": ["매운맛", "해산물", "대표메뉴"],
    "warnings": ["알레르기/비선호 관련 경고"],
    "confidence": "high | medium | low"
  }],
  "recommendations": [{"original": "string", "reason": "string"}],
  "ordering_tips": "주문 팁 (예: 1인 1음료 필수, 오토시 요금 있음)",
  "staff_phrases": {
    "order": "메뉴판 언어로 '이거 주세요' (예: これをください)",
    "allergy_notice": "사용자 알레르기·비선호가 있으면 메뉴판 언어로 '저는 ○○ 알레르기가 있어요/못 먹어요. ○○은 빼주세요' 문장, 없으면 null"
  }
}`;

const WINE_SCHEMA = `{
  "producer": "생산자",
  "wine_name": "와인 이름",
  "vintage": "string | null",
  "country": "string",
  "region": "산지 (예: 부르고뉴 > 코트 드 뉘)",
  "appellation_level": "등급 (예: AOC Village, DOCG, Grand Cru)",
  "grapes": ["품종"],
  "type": "레드 | 화이트 | 로제 | 스파클링 | 디저트",
  "label_terms": [{"term": "라벨 용어", "meaning": "뜻"}],
  "expected_style": {"body": "1-5", "acidity": "1-5", "tannin": "1-5 | null", "sweetness": "1-5"},
  "tasting_notes": "예상 향과 맛",
  "food_pairing": ["string"],
  "drinking_window": "지금 마시기 좋음 / 숙성 필요 등",
  "match_with_user": "사용자 선호와의 궁합 한 줄",
  "confidence": "high | medium | low"
}`;

const SAKE_SCHEMA = `{
  "brewery": "양조장 (한자 + 한글 발음)",
  "brand": "상표명 (한자 + 한글 발음)",
  "prefecture": "현",
  "classification": "특정명칭 (예: 준마이 다이긴조)",
  "classification_meaning": "이 등급이 뜻하는 것",
  "specs": {
    "seimaibuai": "정미율 % | null",
    "nihonshudo": "일본주도 | null",
    "acidity": "산도 | null",
    "alcohol": "도수 | null",
    "rice": "쌀 품종 | null",
    "yeast": "효모 | null"
  },
  "processing": [{"term": "생주/무여과 등", "meaning": "뜻과 맛에 미치는 영향"}],
  "label_terms": [{"term": "기타 라벨 한자", "meaning": "뜻"}],
  "expected_style": {"dry_sweet": "드라이 ↔ 스위트 (1-5)", "light_rich": "가벼움 ↔ 묵직함 (1-5)", "aroma": "향 타입 (긴조향/쌀향/숙성향)"},
  "serving_temp": "추천 온도 (예: 레이슈 10°C, 누루캉)",
  "food_pairing": ["string"],
  "match_with_user": "사용자 선호와의 궁합 한 줄",
  "confidence": "high | medium | low"
}`;

const MODE_INSTRUCTIONS: Record<Mode, string> = {
  menu: `메뉴판 사진이다. 각 메뉴를 항목별로 해석하라.
현지인이 즐겨 먹는 대표 메뉴, 관광객에게 추천할 만한 메뉴를 골라라.`,
  wine: `와인 라벨 사진이다. 라벨의 모든 정보를 해석하고,
해당 산지·품종·스타일의 일반적 특징을 바탕으로 맛을 예상하라.
특정 빈티지 평점이나 가격은 확실하지 않으면 쓰지 마라.`,
  sake: `사케(일본주) 라벨 사진이다. 한자 용어를 모두 풀어서 설명하라.
특정명칭(준마이, 긴조 등), 정미율, 일본주도, 산도, 쌀 품종, 효모, 가공 방식
(나마자케, 무로카, 겐슈, 히야오로시 등)을 찾아 해석하라.
라벨에 없는 수치는 null로 두고 추측하지 마라.`,
};

const MODE_SCHEMAS: Record<Mode, string> = {
  menu: MENU_SCHEMA,
  wine: WINE_SCHEMA,
  sake: SAKE_SCHEMA,
};

export function buildUserPrompt(mode: Mode): string {
  return `${MODE_INSTRUCTIONS[mode]}

아래 JSON 스키마로만 응답하라 (코드블록·설명 없이 JSON 객체 하나만):
${MODE_SCHEMAS[mode]}`;
}

export const RETRY_PROMPT =
  "방금 응답을 JSON으로 파싱할 수 없었다. 같은 내용을 지정된 스키마의 JSON 객체 하나로만 다시 출력하라. 앞뒤 설명·코드블록 금지.";

export const DETECT_PROMPT = `이 사진이 무엇인지 한 단어로만 답하라.
- 음식점 메뉴판(음료 리스트 포함)이면: menu
- 와인 병/라벨이면: wine
- 사케(일본주) 병/라벨이면: sake
menu, wine, sake 중 하나만 출력.`;
