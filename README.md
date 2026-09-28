# Travel Lens 📷🍽🍷🍶

여행 중 **메뉴판·와인 라벨·사케 라벨**을 찍으면 Claude 비전 API로 번역, 맥락 설명, 추천을 한국어로 보여주는 개인용 PWA.
iPhone Safari에서 "홈 화면에 추가"해서 앱처럼 쓰는 것을 전제로 만들었습니다.

- 프론트: Vite + 바닐라 TypeScript (Cloudflare Pages)
- API 프록시: Cloudflare Worker (`worker/`) — API 키는 Worker secret에만 저장
- 모델: `claude-sonnet-5` 기본 (`shared/config.ts`의 `DEFAULT_MODEL`, 앱 설정에서도 변경 가능)

## 구조

```
index.html, src/          앱 (화면: 촬영 / 결과 / 기록 / 설정)
  image.ts                EXIF 회전 보정 + 긴 변 1568px 리사이즈 + JPEG 0.85
  db.ts                   IndexedDB 스캔 기록 (별점·메모)
  render.ts               모드별 결과 카드
  views/staff.ts          "직원에게 보여주기" 화면
public/                   manifest, 아이콘, service worker
shared/                   앱·Worker 공용 타입과 상수 (모델, 토큰 수, 크기 제한)
worker/src/index.ts       프록시: 토큰 확인, 5MB 제한, rate limit, JSON 추출·1회 재시도
worker/src/prompts.ts     공통 시스템 프롬프트 + 모드별 프롬프트/스키마
worker/src/mock.ts        MOCK 모드 샘플 결과
```

## 로컬 실행

```bash
npm install
cp worker/.dev.vars.example worker/.dev.vars   # ANTHROPIC_API_KEY, APP_TOKEN 입력
npm run dev:worker     # Worker → http://localhost:8787
npm run dev            # 앱 → http://localhost:5173 (/api 는 8787로 프록시)
```

- API 비용 없이 UI만 보려면 `worker/.dev.vars`에 `MOCK=true`를 추가하거나 `npm run dev:mock`
- 앱 설정 화면에서 `APP_TOKEN`과 같은 값을 **접근 토큰**에 입력
- 같은 Wi-Fi의 iPhone에서 `http://<PC IP>:5173` 으로 열어 볼 수 있음 (카메라 입력은 동작하지만, service worker/홈 화면 설치는 HTTPS 배포본에서 확인)

## 배포 (Cloudflare)

### 1) Worker

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY --config worker/wrangler.toml
npx wrangler secret put APP_TOKEN --config worker/wrangler.toml   # 길고 랜덤한 문자열
npm run deploy:worker
# → https://travel-lens-api.<계정>.workers.dev
```

`worker/wrangler.toml`의 `ALLOWED_ORIGINS`에 Pages 주소(예: `https://travel-lens.pages.dev`)를 넣으면 그 Origin만 CORS 허용합니다.

### 2) Pages

```bash
VITE_API_BASE=https://travel-lens-api.<계정>.workers.dev npm run deploy:pages
```

`VITE_API_BASE` 없이 배포했다면 앱 설정의 **Worker 주소** 칸에 입력해도 됩니다.
(커스텀 도메인을 쓰면 Worker route를 `<도메인>/api/*`로 잡아 같은 도메인으로 운영할 수도 있습니다.)

## 보안·제한

- 클라이언트에는 API 키가 없음. Worker가 `X-App-Token` 헤더를 `APP_TOKEN`과 비교 (해시 후 상수 시간 비교)
- 요청 본문 5MB 제한 (`Content-Length`와 실제 읽은 바이트 모두 확인)
- Rate limit: IP당 분당 20회 (Cloudflare Rate Limiting 바인딩, 없으면 isolate 메모리 방식으로 폴백)
- 모델은 `shared/config.ts`의 `ALLOWED_MODELS` 안에서만 선택 가능

## 응답 처리

- `max_tokens`: 메뉴판 8000, 라벨 4000 (Sonnet 5는 기본으로 사고(thinking)를 하므로 지시서의 4000/2000보다 여유 있게 잡음)
- 응답에서 JSON만 추출 → 실패 시 이전 응답을 이어 "JSON만 다시" 1회 재시도 → 그래도 실패하면 원문 텍스트 표시
- 자동 모드: 짧은 분류 요청으로 메뉴판/와인/사케를 먼저 판별한 뒤 해당 모드로 해석

## 아이콘 다시 만들기

`public/icons/icon.svg` 수정 후 `npm run icons` (Playwright Chromium 필요)

실기기 테스트는 [docs/iphone-checklist.md](docs/iphone-checklist.md) 참고.
