import Anthropic from "@anthropic-ai/sdk";
import { ALLOWED_MODELS, DEFAULT_MODEL, MAX_REQUEST_BYTES, MAX_TOKENS } from "../../shared/config";
import type { AnalyzeRequest, AnalyzeResponse, Mode } from "../../shared/types";
import { mockResult } from "./mock";
import { DETECT_PROMPT, RETRY_PROMPT, buildSystemPrompt, buildUserPrompt } from "./prompts";

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  /** 허용할 Origin (쉼표 구분). 비우면 모든 Origin 허용 */
  ALLOWED_ORIGINS?: string;
  /** "true"면 Claude를 호출하지 않고 샘플 결과를 돌려준다 (로컬 UI 개발용) */
  MOCK?: string;
  /** Cloudflare Rate Limiting 바인딩 (wrangler.toml [[ratelimits]]) */
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- CORS ----------
function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

// ---------- 인증 ----------
async function tokenMatches(given: string, expected: string): Promise<boolean> {
  // 길이·내용이 달라도 동일한 시간이 걸리도록 해시 후 비교
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// ---------- Rate limit ----------
// 바인딩이 없을 때 쓰는 isolate 단위 메모리 제한 (완벽하진 않지만 기본 방어용)
const RL_LIMIT = 20;
const RL_WINDOW_MS = 60_000;
const memoryBuckets = new Map<string, number[]>();

async function checkRateLimit(env: Env, key: string): Promise<boolean> {
  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key });
    return success;
  }
  const now = Date.now();
  const hits = (memoryBuckets.get(key) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (hits.length >= RL_LIMIT) {
    memoryBuckets.set(key, hits);
    return false;
  }
  hits.push(now);
  memoryBuckets.set(key, hits);
  return true;
}

// ---------- 요청 검증 ----------
const MODES: Mode[] = ["menu", "wine", "sake"];
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

async function readBody(req: Request): Promise<AnalyzeRequest> {
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (declared > MAX_REQUEST_BYTES) throw new HttpError(413, "요청이 너무 큽니다 (최대 5MB)");

  // Content-Length가 없거나 거짓일 수 있으므로 실제로 읽으면서도 제한
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "본문이 비어 있습니다");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "요청이 너무 큽니다 (최대 5MB)");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }

  let body: AnalyzeRequest;
  try {
    body = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, "JSON 형식이 아닙니다");
  }
  if (body.mode !== "auto" && !MODES.includes(body.mode)) throw new HttpError(400, "알 수 없는 모드");
  if (typeof body.image !== "string" || body.image.length < 100) throw new HttpError(400, "이미지가 없습니다");
  if (!MEDIA_TYPES.includes(body.media_type)) throw new HttpError(400, "지원하지 않는 이미지 형식");
  if (!body.prefs || typeof body.prefs !== "object") throw new HttpError(400, "설정값이 없습니다");
  return body;
}

function resolveModel(requested: string | undefined): string {
  if (requested && ALLOWED_MODELS.some((m) => m.id === requested)) return requested;
  return DEFAULT_MODEL;
}

// ---------- 응답 파싱 ----------
export function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function textOf(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    throw new HttpError(422, "모델이 이 이미지 분석을 거절했습니다. 다른 사진으로 시도해 주세요.");
  }
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Haiku 4.5는 effort를 지원하지 않으므로 모델별로 옵션을 나눈다 */
function modelOptions(model: string): Partial<Anthropic.MessageCreateParamsNonStreaming> {
  if (model.startsWith("claude-haiku")) return {};
  return { output_config: { effort: "medium" } };
}

async function detectMode(client: Anthropic, model: string, image: Anthropic.ImageBlockParam): Promise<Mode> {
  const isHaiku = model.startsWith("claude-haiku");
  const msg = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS.detect,
    ...(isHaiku ? {} : { thinking: { type: "disabled" as const } }),
    messages: [{ role: "user", content: [image, { type: "text", text: DETECT_PROMPT }] }],
  });
  const word = textOf(msg).toLowerCase();
  return MODES.find((m) => word.includes(m)) ?? "menu";
}

async function analyze(env: Env, body: AnalyzeRequest): Promise<AnalyzeResponse> {
  const model = resolveModel(body.model);

  if (env.MOCK === "true") {
    const mode: Mode = body.mode === "auto" ? "menu" : body.mode;
    await new Promise((r) => setTimeout(r, 1200));
    return { mode, data: mockResult(mode), raw: null, model: `${model} (mock)` };
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const image: Anthropic.ImageBlockParam = {
    type: "image",
    source: { type: "base64", media_type: body.media_type, data: body.image },
  };

  const mode = body.mode === "auto" ? await detectMode(client, model, image) : body.mode;
  const system = buildSystemPrompt(body.prefs);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: [image, { type: "text", text: buildUserPrompt(mode) }] },
  ];

  const first = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS[mode],
    system,
    messages,
    ...modelOptions(model),
  });
  const firstText = textOf(first);
  const parsed = extractJson(firstText);
  if (parsed) return { mode, data: parsed as AnalyzeResponse["data"], raw: null, model };

  // 1회 재시도: 이전 응답을 그대로 이어서 JSON만 다시 요청
  const retry = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS[mode],
    system,
    messages: [
      ...messages,
      { role: "assistant", content: first.content },
      { role: "user", content: RETRY_PROMPT },
    ],
    ...modelOptions(model),
  });
  const retryText = textOf(retry);
  const reparsed = extractJson(retryText);
  if (reparsed) return { mode, data: reparsed as AnalyzeResponse["data"], raw: null, model };

  // 폴백: 원문 텍스트 그대로
  return { mode, data: null, raw: retryText || firstText, model };
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new HttpError(502, "Worker의 Anthropic API 키가 올바르지 않습니다");
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, "Claude API 사용량 제한에 걸렸습니다. 잠시 후 다시 시도하세요");
  if (err instanceof Anthropic.BadRequestError) return new HttpError(400, `요청 오류: ${err.message}`);
  if (err instanceof Anthropic.APIError) return new HttpError(502, `Claude API 오류 (${err.status ?? "network"})`);
  console.error(err);
  return new HttpError(500, "서버 오류");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        return json({ ok: true, mock: env.MOCK === "true" }, 200, cors);
      }

      if (url.pathname !== "/api/analyze") throw new HttpError(404, "Not found");
      if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다");

      if (!env.APP_TOKEN) throw new HttpError(500, "Worker에 APP_TOKEN이 설정되지 않았습니다");
      const token = req.headers.get("X-App-Token") ?? "";
      if (!(await tokenMatches(token, env.APP_TOKEN))) throw new HttpError(401, "접근 토큰이 올바르지 않습니다");

      const ip = req.headers.get("CF-Connecting-IP") ?? "local";
      if (!(await checkRateLimit(env, ip))) throw new HttpError(429, "요청이 너무 많습니다. 1분 후 다시 시도하세요");

      if (env.MOCK !== "true" && !env.ANTHROPIC_API_KEY) {
        throw new HttpError(500, "Worker에 ANTHROPIC_API_KEY가 설정되지 않았습니다");
      }

      const body = await readBody(req);
      const result = await analyze(env, body);
      return json(result, 200, cors);
    } catch (err) {
      const e = toHttpError(err);
      return json({ error: e.message }, e.status, cors);
    }
  },
} satisfies ExportedHandler<Env>;
