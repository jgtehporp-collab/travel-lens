import type { Confidence, MenuResult, Mode, SakeResult, TermMeaning, WineResult } from "../shared/types";
import { esc } from "./util";

export const MODE_META: Record<Mode, { icon: string; label: string }> = {
  menu: { icon: "🍽", label: "메뉴판" },
  wine: { icon: "🍷", label: "와인" },
  sake: { icon: "🍶", label: "사케" },
};

const CONF_LABEL: Record<Confidence, string> = { high: "확실", medium: "보통", low: "불확실" };

function confBadge(c: Confidence | undefined, showHigh = false): string {
  if (!c || (c === "high" && !showHigh)) return "";
  return `<span class="badge conf-${esc(c)}">인식 ${esc(CONF_LABEL[c] ?? c)}</span>`;
}

function matchBadge(text: string | undefined): string {
  if (!text) return "";
  const cls = text.startsWith("잘 맞음") ? "good" : text.startsWith("안 맞을") ? "bad" : "mid";
  return `<div class="match match-${cls}">${esc(text)}</div>`;
}

function toLevel(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= 5 ? n : null;
}

function scale(label: string, value: unknown, left = "", right = ""): string {
  const n = toLevel(value);
  if (n === null) {
    return value ? `<div class="scale"><span class="scale-label">${esc(label)}</span><span>${esc(value)}</span></div>` : "";
  }
  const dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(n) ? "on" : ""}"></i>`).join("");
  return `<div class="scale">
    <span class="scale-label">${esc(label)}</span>
    ${left ? `<span class="scale-end">${esc(left)}</span>` : ""}
    <span class="dots" aria-label="${esc(label)} ${n}/5">${dots}</span>
    ${right ? `<span class="scale-end">${esc(right)}</span>` : ""}
  </div>`;
}

function chips(list: string[] | undefined, cls = "chip"): string {
  if (!list?.length) return "";
  return `<div class="chips">${list.map((t) => `<span class="${cls}">${esc(t)}</span>`).join("")}</div>`;
}

function terms(title: string, list: TermMeaning[] | undefined): string {
  if (!list?.length) return "";
  return `<section class="card">
    <h3>${esc(title)}</h3>
    <dl class="terms">${list.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd>`).join("")}</dl>
  </section>`;
}

function kv(rows: [string, unknown][]): string {
  const filled = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!filled.length) return "";
  return `<dl class="kv">${filled.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

// ---------- 메뉴판 ----------
export function renderMenu(r: MenuResult): string {
  const recommended = new Set((r.recommendations ?? []).map((x) => x.original));
  const items = (r.items ?? [])
    .map((it, i) => {
      const warn = it.warnings?.length ? `<ul class="warnings">${it.warnings.map((w) => `<li>⚠️ ${esc(w)}</li>`).join("")}</ul>` : "";
      return `<article class="card item ${it.warnings?.length ? "has-warning" : ""}" data-index="${i}">
        <label class="pick" title="직원에게 보여주기 목록에 추가">
          <input type="checkbox" data-pick="${i}" aria-label="${esc(it.korean_name)} 선택" />
          <span></span>
        </label>
        <div class="item-head">
          <div>
            <div class="orig">${esc(it.original)}</div>
            <div class="reading">${esc(it.reading)}</div>
          </div>
          <div class="price">
            ${esc(it.price)}
            ${it.price_krw ? `<small>${esc(it.price_krw)}</small>` : ""}
          </div>
        </div>
        <h3 class="ko">${recommended.has(it.original) ? "⭐ " : ""}${esc(it.korean_name)} ${confBadge(it.confidence)}</h3>
        <p>${esc(it.description)}</p>
        ${it.taste ? `<p class="taste">👅 ${esc(it.taste)}</p>` : ""}
        ${chips(it.tags)}
        ${warn}
      </article>`;
    })
    .join("");

  const recs = r.recommendations?.length
    ? `<section class="card highlight">
        <h3>⭐ 추천</h3>
        <ul class="recs">${r.recommendations.map((x) => `<li><b>${esc(x.original)}</b><span>${esc(x.reason)}</span></li>`).join("")}</ul>
      </section>`
    : "";

  return `
    <section class="card summary">
      <div class="summary-row"><span class="big-emoji">🍽</span>
        <div><h2>${esc(r.restaurant_type || "메뉴판")}</h2><div class="muted">${esc(r.language)} · ${r.items?.length ?? 0}개 메뉴</div></div>
      </div>
      ${r.ordering_tips ? `<p class="tip">💡 ${esc(r.ordering_tips)}</p>` : ""}
    </section>
    ${recs}
    <div class="items">${items}</div>`;
}

// ---------- 와인 ----------
export function renderWine(r: WineResult): string {
  const s = r.expected_style ?? ({} as WineResult["expected_style"]);
  return `
    <section class="card summary">
      <div class="summary-row"><span class="big-emoji">🍷</span>
        <div>
          <h2>${esc(r.wine_name)} ${r.vintage ? `<span class="vintage">${esc(r.vintage)}</span>` : ""}</h2>
          <div class="muted">${esc(r.producer)}</div>
        </div>
      </div>
      ${matchBadge(r.match_with_user)}
      ${confBadge(r.confidence, true)}
    </section>
    <section class="card">
      <h3>기본 정보</h3>
      ${kv([
        ["타입", r.type],
        ["국가", r.country],
        ["산지", r.region],
        ["등급", r.appellation_level],
        ["품종", r.grapes?.join(", ")],
        ["마실 시기", r.drinking_window],
      ])}
    </section>
    <section class="card">
      <h3>예상 스타일</h3>
      ${scale("바디", s.body, "가벼움", "묵직")}
      ${scale("산도", s.acidity)}
      ${s.tannin !== null ? scale("타닌", s.tannin) : ""}
      ${scale("당도", s.sweetness, "드라이", "스위트")}
      ${r.tasting_notes ? `<p class="taste">👃 ${esc(r.tasting_notes)}</p>` : ""}
    </section>
    ${r.food_pairing?.length ? `<section class="card"><h3>어울리는 음식</h3>${chips(r.food_pairing)}</section>` : ""}
    ${terms("라벨 용어", r.label_terms)}`;
}

// ---------- 사케 ----------
export function renderSake(r: SakeResult): string {
  const s = r.expected_style ?? ({} as SakeResult["expected_style"]);
  const sp = r.specs ?? ({} as SakeResult["specs"]);
  const specs = kv([
    ["정미율", sp.seimaibuai],
    ["일본주도", sp.nihonshudo],
    ["산도", sp.acidity],
    ["도수", sp.alcohol],
    ["쌀", sp.rice],
    ["효모", sp.yeast],
  ]);
  return `
    <section class="card summary">
      <div class="summary-row"><span class="big-emoji">🍶</span>
        <div><h2>${esc(r.brand)}</h2><div class="muted">${esc(r.brewery)} · ${esc(r.prefecture)}</div></div>
      </div>
      ${matchBadge(r.match_with_user)}
      ${confBadge(r.confidence, true)}
    </section>
    <section class="card">
      <h3>${esc(r.classification || "등급")}</h3>
      <p>${esc(r.classification_meaning)}</p>
      ${specs || `<p class="muted">라벨에 수치 표기 없음</p>`}
    </section>
    <section class="card">
      <h3>예상 스타일</h3>
      ${scale("맛", s.dry_sweet, "드라이", "스위트")}
      ${scale("바디", s.light_rich, "가벼움", "묵직")}
      ${s.aroma ? `<p class="taste">👃 ${esc(s.aroma)}</p>` : ""}
      ${r.serving_temp ? `<p class="taste">🌡 ${esc(r.serving_temp)}</p>` : ""}
    </section>
    ${terms("가공 방식", r.processing)}
    ${r.food_pairing?.length ? `<section class="card"><h3>어울리는 음식</h3>${chips(r.food_pairing)}</section>` : ""}
    ${terms("라벨 용어", r.label_terms)}`;
}

export function renderResult(mode: Mode, data: unknown): string {
  if (mode === "menu") return renderMenu(data as MenuResult);
  if (mode === "wine") return renderWine(data as WineResult);
  return renderSake(data as SakeResult);
}

/** 기록 목록용 제목/부제 */
export function summarize(mode: Mode, data: unknown): { title: string; subtitle: string } {
  try {
    if (mode === "menu") {
      const r = data as MenuResult;
      const names = (r.items ?? []).slice(0, 3).map((i) => i.korean_name).join(", ");
      return { title: r.restaurant_type || "메뉴판", subtitle: names };
    }
    if (mode === "wine") {
      const r = data as WineResult;
      return {
        title: [r.wine_name, r.vintage].filter(Boolean).join(" "),
        subtitle: [r.producer, r.region].filter(Boolean).join(" · "),
      };
    }
    const r = data as SakeResult;
    return { title: r.brand, subtitle: [r.classification, r.prefecture].filter(Boolean).join(" · ") };
  } catch {
    return { title: MODE_META[mode].label, subtitle: "" };
  }
}

export function skeleton(mode: Mode | "auto"): string {
  const block = `<section class="card sk"><div class="sk-line w60"></div><div class="sk-line w90"></div><div class="sk-line w75"></div></section>`;
  return block + block + (mode === "menu" || mode === "auto" ? block + block : "");
}
