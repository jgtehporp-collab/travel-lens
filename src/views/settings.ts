import { ALLOWED_MODELS } from "../../shared/config";
import { fetchKrwRate } from "../api";
import { listScans } from "../db";
import { type AppSettings, CURRENCIES, DEFAULT_SETTINGS, loadSettings, saveSettings } from "../settings";
import { esc, formatYmd, listFromText, toast } from "../util";

function field(label: string, name: string, value: string, opts: { type?: string; placeholder?: string; hint?: string } = {}): string {
  return `<label class="field"><span>${esc(label)}</span>
    <input name="${name}" type="${opts.type ?? "text"}" ${opts.type === "number" ? 'step="any" inputmode="decimal"' : ""} value="${esc(value)}" placeholder="${esc(opts.placeholder ?? "")}" autocomplete="off" />
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
    <form id="form" class="settings" novalidate>
      <section class="card">
        <h3>🔑 연결</h3>
        ${field("접근 토큰", "token", s.token, { type: "password", placeholder: "Vercel에 등록한 APP_TOKEN 값", hint: "이 기기에만 저장돼요" })}
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
        <p class="muted small" id="rate-info">${esc(rateInfo(s))}</p>
      </section>

      <div class="sticky-save"><button type="submit" class="btn">저장</button></div>

      <section class="card">
        <h3>기타</h3>
        <p class="muted small">저장된 스캔 ${count}개 (이 기기의 IndexedDB)</p>
        <button type="button" class="btn secondary" id="reset">선호 설정을 기본값으로 되돌리기</button>
      </section>
    </form>`;

  const form = root.querySelector<HTMLFormElement>("#form")!;
  const rateInfoEl = root.querySelector<HTMLElement>("#rate-info")!;
  // 환율 입력값의 출처 (직접 수정하면 '직접 입력'으로 바뀜)
  const rateMeta = { date: s.krw_rate_date, source: s.krw_rate_source, checkedAt: s.krw_rate_checked_at };
  const setManualRate = () => {
    rateMeta.date = null;
    rateMeta.source = null;
    rateInfoEl.textContent = rateInfo({ ...s, ...collect() });
  };
  const val = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();

  const collect = (): AppSettings => ({
    ...loadSettings(),
    token: val("token"),
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
    krw_rate_date: rateMeta.date,
    krw_rate_source: rateMeta.source,
    krw_rate_checked_at: rateMeta.checkedAt,
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings(collect());
    toast("저장했어요 ✅");
  });

  const loadRate = async (quiet: boolean) => {
    const currency = val("currency");
    if (CURRENCIES.find((c) => c.code === currency)?.eximSupported === false) {
      if (!quiet) toast("수출입은행이 이 통화 환율을 제공하지 않아요. 직접 입력해 주세요");
      return;
    }
    try {
      const r = await fetchKrwRate({ ...s, token: val("token") }, currency);
      (form.elements.namedItem("krw_rate") as HTMLInputElement).value = String(r.rate);
      Object.assign(rateMeta, { date: r.date, source: r.source, checkedAt: Date.now() });
      rateInfoEl.textContent = rateInfo({ ...s, ...collect() });
      if (!quiet) toast(`1 ${currency} ≈ ${r.rate}원 (저장을 눌러 적용)`);
    } catch (e) {
      if (!quiet) toast(e instanceof Error ? e.message : "환율을 불러오지 못했어요");
    }
  };

  (form.elements.namedItem("currency") as HTMLSelectElement).addEventListener("change", () => {
    const c = CURRENCIES.find((x) => x.code === val("currency"));
    if (c) (form.elements.namedItem("krw_rate") as HTMLInputElement).value = String(c.rate);
    setManualRate();
    rateMeta.checkedAt = 0;
    void loadRate(true);
  });
  (form.elements.namedItem("krw_rate") as HTMLInputElement).addEventListener("input", setManualRate);
  root.querySelector("#rate")!.addEventListener("click", () => void loadRate(false));

  root.querySelector("#test")!.addEventListener("click", async () => {
    const cur = collect();
    try {
      const res = await fetch("/api/health");
      const data = (await res.json()) as { ok?: boolean; mock?: boolean; exchange_rate?: boolean };
      if (!data.ok) return toast("응답이 이상해요");
      // 토큰까지 맞는지 확인하려고 환율 API를 한 번 호출 (키가 없으면 501 → 토큰은 통과)
      const check = await fetch(`/api/rate?currency=USD`, { headers: { "X-App-Token": cur.token } });
      if (check.status === 401) return toast("서버는 연결됐지만 접근 토큰이 틀려요");
      toast(`연결 성공${data.mock ? " (MOCK 모드)" : ""}${data.exchange_rate ? "" : " · 환율 자동 조회 꺼짐"} ✅`);
    } catch {
      toast("서버에 연결할 수 없어요");
    }
  });

  root.querySelector("#reset")!.addEventListener("click", () => {
    if (!confirm("알레르기·와인·사케·통화 설정을 기본값으로 되돌릴까요? (토큰은 유지)")) return;
    const cur = loadSettings();
    saveSettings({ ...structuredClone(DEFAULT_SETTINGS), token: cur.token, model: cur.model });
    void renderSettings(root);
    toast("기본값으로 되돌렸어요");
  });
}

function rateInfo(s: AppSettings): string {
  if (CURRENCIES.find((c) => c.code === s.currency)?.eximSupported === false) {
    return "수출입은행 미제공 통화 — 직접 입력한 값을 사용해요";
  }
  if (s.krw_rate_date) return `${formatYmd(s.krw_rate_date)} ${s.krw_rate_source ?? ""} 기준 · 앱 실행 시 12시간마다 자동 갱신`;
  return "기본값/직접 입력 — '환율 불러오기'로 한국수출입은행 기준율을 받아올 수 있어요";
}
