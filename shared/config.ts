// 모델/토큰 관련 상수. 모델을 바꾸려면 여기(또는 앱 설정 화면)에서 변경한다.
export const DEFAULT_MODEL = "claude-sonnet-5";

// 서버가 허용하는 모델 목록 (앱 설정 드롭다운에도 이 목록이 노출된다)
export const ALLOWED_MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5 (기본, 빠르고 저렴)" },
  { id: "claude-opus-5", label: "Opus 5 (더 정확, 느리고 비쌈)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (가장 빠름)" },
] as const;

export type ModelId = (typeof ALLOWED_MODELS)[number]["id"];

export const MAX_TOKENS = {
  menu: 8000,
  wine: 4000,
  sake: 4000,
  detect: 16,
} as const;

// 요청 본문 최대 크기 (base64 이미지 포함). Vercel Functions 본문 한도(4.5MB)보다 조금 작게 둔다
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

// 클라이언트 리사이즈 기준
export const IMAGE_MAX_EDGE = 1568;
export const IMAGE_JPEG_QUALITY = 0.85;
