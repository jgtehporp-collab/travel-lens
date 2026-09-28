// Vercel Functions(api/*)와 로컬 Vite 미들웨어가 함께 쓰는 공용 유틸
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function env(name: "ANTHROPIC_API_KEY" | "APP_TOKEN" | "MOCK" | "KOREAEXIM_API_KEY"): string {
  return process.env[name] ?? "";
}

export const isMock = () => env("MOCK") === "true";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** 핸들러를 감싸서 HttpError를 JSON 응답으로 바꾼다 */
export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "서버 오류" }, 500);
    }
  };
}

// ---------- 인증 ----------
export async function requireToken(req: Request): Promise<void> {
  const expected = env("APP_TOKEN");
  if (!expected) throw new HttpError(500, "서버에 APP_TOKEN이 설정되지 않았습니다");
  const given = req.headers.get("X-App-Token") ?? "";
  // 길이·내용이 달라도 같은 시간이 걸리도록 해시 후 비교
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  if (diff !== 0) throw new HttpError(401, "접근 토큰이 올바르지 않습니다");
}

// ---------- Rate limit ----------
// 함수 인스턴스 단위 메모리 제한 (기본 방어용). 더 강하게 막으려면 Vercel Firewall 규칙 추가.
const RL_LIMIT = 20;
const RL_WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

export function requireRateLimit(key: string): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (hits.length >= RL_LIMIT) {
    buckets.set(key, hits);
    throw new HttpError(429, "요청이 너무 많습니다. 1분 후 다시 시도하세요");
  }
  hits.push(now);
  buckets.set(key, hits);
}

// ---------- 본문 읽기 (크기 제한) ----------
export async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const tooBig = () => new HttpError(413, `요청이 너무 큽니다 (최대 ${(maxBytes / 1024 / 1024).toFixed(1)}MB)`);
  if (Number(req.headers.get("Content-Length") ?? "0") > maxBytes) throw tooBig();

  // Content-Length가 없거나 거짓일 수 있으므로 실제로 읽으면서도 제한
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "본문이 비어 있습니다");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "JSON 형식이 아닙니다");
  }
}
