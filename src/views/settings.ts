import { ALLOWED_MODELS } from "../../shared/config";
import { fetchKrwRate } from "../api";
import { listScans } from "../db";
import { type AppSettings, CURRENCIES, DEFAULT_SETTINGS, apiBase, loadSettings, saveSettings } from "../settings";
import { esc, listFromText, toast } from "../util";

function field(label: string, name: string, value: string, opts: { type?: string; placeholder?: string; hint?: string } = {}): string {
  return `<label class="field"><span>${esc(label)}</span>
    <input name="${name}" type="${opts.type ?? "text"}" value="${esc(value)}" placeholder="${esc(opts.placeholder ?? "")}" autocomplete="off" />
    ${opts.hint ? `<small>${esc(opts.hint)}</small>` : ""}</label>`;
}

function area(label: string, name: string, value: string, placeholder = ""): string {
  return `<label class="field"><span>${esc(label)}</span>
    <textarea name="${name}" rows="2" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  const s = loadSettings();
  const count = (await listScans()).length;
  const currencyKnown = CURRENCIES.some((c) => c.code === s.currency);

  root.innerHTML = `
    <header class="top"><h1>설정</h1></header>
    <form id="form" class="settings">
      <section class="card">
        <h3>🔑 연결</h3>
        ${field("접근 토큰", "token", s.token, { type: "password", placeholder: "Worker의 APP_TOKEN 값", hint: "이 기기에만 저장돼요" })}
        ${field("Worker 주소 (선택)", "api_base", s.api_base, {
          type: "url",
          placeholder: apiBase({ ...s, api_base: "" }) || "https://travel-lens-api.<계정>.workers.dev",
          hint: "비워두면 빌드 시 지정한 주소 또는 같은 도메인의 /api 사용",
        })}
        <label class="field"><span>모델</span>
          <select name="model">${ALLOWED_MODELS.map((m) => `<option value="${m.id}" ${m.id === s.model ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
        </label>
        <button type="button" class="btn secondary" id="test">연결 테스트</button>
      </section>

      <section class="card">
        <h3>⚠️ 알레르기 · 비선호</h3>
        ${area("알레르기 (쉼표로 구분)", "allergies", s.allergies.join(", "), "예: 새우, 땅콩, 메밀")}
        ${area("비선호 재료", "dislikes", s.dislikes.join(", "), "예: 고수, 내장, 날달걀")}
      </section>

      <section class="card">
        <h3>🍷 와인 선호</h3>
        ${field("타입", "wine_type", s.wine_prefs.type)}
        ${field("바디", "wine_body", s.wine_prefs.body)}
        ${field("타닌", "wine_tannin", s.wine_prefs.tannin)}
        ${field("피니시", "wine_finish", s.wine_prefs.finish)}
        ${area("요약", "wine_summary", s.wine_prefs.summary)}
      </section>

      <section class="card">
        <h3>🍶 사케 선호</h3>
        ${field("당도", "sake_sweetness", s.sake_prefs.sweetness)}
        ${field("스타일", "sake_style", s.sake_prefs.style)}
        ${field("온도", "sake_temperature", s.sake_prefs.temperature)}
        ${area("요약", "sake_summary", s.sake_prefs.summary)}
      </section>

      <section class="card">
        <h3>💱 통화</h3>
        <label class="toggle"><input type="checkbox" name="convert_to_krw" ${s.convert_to_krw ? "checked" : ""} /> 가격을 원화로 환산해서 함께 보기</label>
        <label class="field"><span>여행 국가 통화</span>
          <select name="currency">
            ${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === s.currency ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
            ${currencyKnown ? "" : `<option value="${esc(s.currency)}" selected>${esc(s.currency)}</option>`}
          </select>
        </label>
        <div class="row">
          ${field("1 단위당 원화", "krw_rate", String(s.krw_rate ?? ""), { type: "number" })}
          <button type="button" class="btn secondary" id="rate">환율 불러오기</button>
        </div>
      </section>

      <div class="sticky-save"><button type="submit" class="btn">저장</button></div>

      <section class="card">
        <h3>기타</h3>
        <p class="muted small">저장된 스캔 ${count}개 (이 기기의 IndexedDB)</p>
        <button type="button" class="btn secondary" id="reset">선호 설정을 기본값으로 되돌리기</button>
      </section>
    </form>`;

  const form = root.querySelector<HTMLFormElement>("#form")!;
  const val = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();

  const collect = (): AppSettings => ({
    ...loadSettings(),
    token: val("token"),
    api_base: val("api_base"),
    model: val("model"),
    allergies: listFromText(val("allergies")),
    dislikes: listFromText(val("dislikes")),
    wine_prefs: {
      type: val("wine_type"),
      body: val("wine_body"),
      tannin: val("wine_tannin"),
      finish: val("wine_finish"),
      summary: val("wine_summary"),
    },
    sake_prefs: {
      sweetness: val("sake_sweetness"),
      style: val("sake_style"),
      temperature: val("sake_temperature"),
      summary: val("sake_summary"),
    },
    convert_to_krw: (form.elements.namedItem("convert_to_krw") as HTMLInputElement).checked,
    currency: val("currency"),
    krw_rate: Number(val("krw_rate")) || null,
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings(collect());
    toast("저장했어요 ✅");
  });

  (form.elements.namedItem("currency") as HTMLSelectElement).addEventListener("change", () => {
    const c = CURRENCIES.find((x) => x.code === val("currency"));
    if (c) (form.elements.namedItem("krw_rate") as HTMLInputElement).value = String(c.rate);
  });

  root.querySelector("#rate")!.addEventListener("click", async () => {
    try {
      const rate = await fetchKrwRate(val("currency"));
      (form.elements.namedItem("krw_rate") as HTMLInputElement).value = String(rate);
      toast(`1 ${val("currency")} ≈ ${rate}원 (저장을 눌러 적용)`);
    } catch {
      toast("환율을 불러오지 못했어요. 직접 입력해 주세요");
    }
  });

  root.querySelector("#test")!.addEventListener("click", async () => {
    const cur = collect();
    try {
      const res = await fetch(`${apiBase(cur)}/api/health`);
      const data = (await res.json()) as { ok?: boolean; mock?: boolean };
      toast(data.ok ? `연결 성공${data.mock ? " (MOCK 모드)" : ""} ✅` : "응답이 이상해요");
    } catch {
      toast("Worker에 연결할 수 없어요");
    }
  });

  root.querySelector("#reset")!.addEventListener("click", () => {
    if (!confirm("알레르기·와인·사케·통화 설정을 기본값으로 되돌릴까요? (토큰은 유지)")) return;
    const cur = loadSettings();
    saveSettings({ ...structuredClone(DEFAULT_SETTINGS), token: cur.token, api_base: cur.api_base, model: cur.model });
    void renderSettings(root);
    toast("기본값으로 되돌렸어요");
  });
}
