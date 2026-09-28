# Travel Lens 📷🍽🍷🍶

여행 중 **메뉴판·와인 라벨·사케 라벨**을 찍으면 Claude 비전 API로 번역, 맥락 설명, 추천을 한국어로 보여주는 개인용 PWA.
iPhone Safari에서 "홈 화면에 추가"해서 앱처럼 쓰는 것을 전제로 만들었습니다.

- 프론트: Vite + 바닐라 TypeScript
- API: Vercel Functions (`api/`) — API 키는 Vercel 환경변수에만 저장, 앱과 같은 도메인
- 모델: `claude-sonnet-5` 기본 (`shared/config.ts`의 `DEFAULT_MODEL`, 앱 설정에서도 변경 가능)
- 원화 환산: 한국수출입은행 현재환율 API (매매기준율)

## 구조

```
index.html, src/          앱 (화면: 촬영 / 결과 / 기록 / 설정)
  image.ts                EXIF 회전 보정 + 긴 변 1568px 리사이즈 + JPEG 0.85, 기록용 480px 썸네일
  db.ts                   IndexedDB 스캔 기록 (썸네일·결과·별점·메모, 원본 사진은 저장 안 함)
  render.ts               모드별 결과 카드
  views/staff.ts          "직원에게 보여주기" 화면
api/                      Vercel Functions 진입점 (analyze, rate, health)
server/                   서버 로직
  analyze.ts              토큰 확인, 4MB 제한, rate limit, Claude 호출, JSON 추출·1회 재시도
  prompts.ts              공통 시스템 프롬프트 + 모드별 프롬프트/스키마
  rate.ts                 한국수출입은행 환율 조회 (최근 영업일 탐색, 1시간 캐시)
  mock.ts                 MOCK 모드 샘플 결과
shared/                   앱·서버 공용 타입과 상수
public/                   manifest, 아이콘, service worker
```

## 로컬 실행

```bash
npm install
cp .env.example .env.local     # ANTHROPIC_API_KEY, APP_TOKEN (+ 선택: KOREAEXIM_API_KEY)
npm run dev                    # http://localhost:5173  (/api 도 Vite가 같이 처리)
npm run dev:mock               # Claude 호출 없이 샘플 결과로 UI 확인
```

- 앱 설정 화면에서 `APP_TOKEN`과 같은 값을 **접근 토큰**에 입력
- 같은 Wi-Fi의 iPhone에서 `http://<PC IP>:5173` 으로 열어볼 수 있음 (홈 화면 설치·오프라인은 HTTPS 배포본에서 확인)

## 배포 (Vercel)

1. [vercel.com/new](https://vercel.com/new)에서 이 GitHub 저장소를 Import (프레임워크는 Vite로 자동 인식, `vercel.json` 설정 사용)
2. Project → Settings → **Environment Variables**에 등록
   | 이름 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | Anthropic Console에서 발급한 키 |
   | `APP_TOKEN` | 길고 랜덤한 문자열 (앱 설정에 입력할 값) |
   | `KOREAEXIM_API_KEY` | (선택) 수출입은행 인증키 — 없으면 환율은 직접 입력 |
3. Deploy → `https://<프로젝트>.vercel.app` 을 iPhone Safari에서 열고 "홈 화면에 추가"

CLI를 쓰려면 `npx vercel` → `npx vercel env add ...` → `npx vercel --prod`.

- `vercel.json`에서 함수 리전을 서울(`icn1`)로 지정했습니다 (수출입은행 API 호출 안정성).
- 분석 함수 최대 실행 시간 180초 (`api/analyze.ts`의 `maxDuration`).

## 원화 환산 (한국수출입은행)

- 인증키 발급: [한국수출입은행 현재환율 API](https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=O) → 인증키 발급신청 (무료, 하루 1000회)
- 영업일 11시 전후로 갱신되며, 주말·공휴일에는 가장 최근 영업일 매매기준율을 사용
- 앱을 열 때 12시간에 한 번 자동 갱신, 설정의 **환율 불러오기**로 수동 갱신
- 대만달러(TWD)·베트남동(VND)은 수출입은행이 제공하지 않아 직접 입력
- 개인정보 보유기간(2년)이 지나면 키가 파기될 수 있음 → 오류 문구가 나오면 재발급

## 보안·제한

- 클라이언트에는 API 키가 없음. 서버가 `X-App-Token` 헤더를 `APP_TOKEN`과 비교 (해시 후 상수 시간 비교)
- 요청 본문 4MB 제한 (Vercel Functions 본문 한도 4.5MB). 리사이즈한 사진은 보통 1MB 이하
- Rate limit: IP당 분당 20회 (함수 인스턴스 메모리 기준의 기본 방어). 더 확실히 막으려면 Vercel 대시보드 **Firewall**에서 `/api/analyze` 속도 제한 규칙 추가
- 모델은 `shared/config.ts`의 `ALLOWED_MODELS` 안에서만 선택 가능

## 응답 처리

- `max_tokens`: 메뉴판 8000, 라벨 4000 (Sonnet 5는 기본으로 사고(thinking)를 하므로 여유 있게)
- 응답에서 JSON만 추출 → 실패 시 이전 응답을 이어 "JSON만 다시" 1회 재시도 → 그래도 실패하면 원문 텍스트 표시
- 자동 모드: 짧은 분류 요청으로 메뉴판/와인/사케를 먼저 판별한 뒤 해당 모드로 해석 (요청 2회)

## 사진 저장

원본 사진은 저장하지 않습니다. 업로드용 사진은 해석이 끝날 때까지만 메모리에 두고(실패 시 같은 세션에서 재시도 가능), 기록에는 480px 썸네일만 남깁니다.
이전 버전에서 저장된 원본 사진은 앱을 처음 열 때 자동으로 지워집니다.

## 아이콘 다시 만들기

`public/icons/icon.svg` 수정 후 `npm run icons` (Playwright Chromium 필요)

실기기 테스트는 [docs/iphone-checklist.md](docs/iphone-checklist.md) 참고.
