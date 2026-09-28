import Anthropic from "@anthropic-ai/sdk";
import { ALLOWED_MODELS, DEFAULT_MODEL, MAX_REQUEST_BYTES, MAX_TOKENS } from "../shared/config.js";
import type { AnalyzeRequest, AnalyzeResponse, Mode } from "../shared/types.js";
import { HttpError, clientIp, env, handle, isMock, json, readJson, requireRateLimit, requireToken } from "./http.js";
import { mockResult } from "./mock.js";
import { DETECT_PROMPT, RETRY_PROMPT, buildSystemPrompt, buildUserPrompt } from "./prompts.js";

const MODES: Mode[] = ["menu", "wine", "sake"];
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function validate(body: AnalyzeRequest): AnalyzeRequest {
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

async function analyze(body: AnalyzeRequest): Promise<AnalyzeResponse> {
  const model = resolveModel(body.model);

  if (isMock()) {
    const mode: Mode = body.mode === "auto" ? "menu" : body.mode;
    await new Promise((r) => setTimeout(r, 1200));
    return { mode, data: mockResult(mode), raw: null, model: `${model} (mock)` };
  }

  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 1 });
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

function toHttpError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError) return new HttpError(502, "서버의 Anthropic API 키가 올바르지 않습니다");
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, "Claude API 사용량 제한에 걸렸습니다. 잠시 후 다시 시도하세요");
  if (err instanceof Anthropic.BadRequestError) return new HttpError(400, `요청 오류: ${err.message}`);
  if (err instanceof Anthropic.APIError) return new HttpError(502, `Claude API 오류 (${err.status ?? "network"})`);
  return err;
}

export const analyzeHandler = handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST만 허용됩니다");
  await requireToken(req);
  requireRateLimit(clientIp(req));
  if (!isMock() && !env("ANTHROPIC_API_KEY")) throw new HttpError(500, "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다");

  const body = validate(await readJson<AnalyzeRequest>(req, MAX_REQUEST_BYTES));
  try {
    return json(await analyze(body));
  } catch (err) {
    throw toHttpError(err);
  }
});
