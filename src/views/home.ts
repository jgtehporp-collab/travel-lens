import type { RequestMode } from "../../shared/types";
import { listScans } from "../db";
import { MODE_META } from "../render";
import { loadSettings, saveSettings } from "../settings";
import { esc, formatDate } from "../util";
import { startScan } from "../scan";

const TABS: { mode: RequestMode; icon: string; label: string }[] = [
  { mode: "menu", ...MODE_META.menu },
  { mode: "wine", ...MODE_META.wine },
  { mode: "sake", ...MODE_META.sake },
  { mode: "auto", icon: "✨", label: "자동" },
];

const HINTS: Record<RequestMode, string> = {
  menu: "메뉴판 전체가 보이게, 글자가 선명하게 찍어주세요",
  wine: "앞면 라벨을 정면에서 찍어주세요 (뒷면 라벨도 도움돼요)",
  sake: "라벨의 한자가 잘 보이게 찍어주세요 (뒷면 스펙 라벨 추천)",
  auto: "메뉴판·와인·사케를 자동으로 구분해서 해석해요",
};

export async function renderHome(root: HTMLElement): Promise<void> {
  const settings = loadSettings();
  let mode = settings.last_mode;

  root.innerHTML = `
    <header class="top"><h1>Travel Lens</h1></header>
    <nav class="mode-tabs" role="tablist">
      ${TABS.map(
        (t) => `<button role="tab" data-mode="${t.mode}" aria-selected="${t.mode === mode}">
          <span class="tab-icon">${t.icon}</span><span>${t.label}</span></button>`,
      ).join("")}
    </nav>
    ${settings.token ? "" : `<a class="notice" href="#/settings">🔑 먼저 설정에서 접근 토큰을 입력해 주세요 →</a>`}
    <p class="hint" id="hint">${esc(HINTS[mode])}</p>
    <label class="capture">
      <input type="file" accept="image/*" capture="environment" id="camera" hidden />
      <span class="capture-icon">📷</span>
      <span class="capture-label">촬영하기</span>
    </label>
    <label class="btn secondary album">
      <input type="file" accept="image/*" id="album" hidden />
      🖼 앨범에서 선택
    </label>
    <section id="recent"></section>`;

  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode as RequestMode;
      root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      root.querySelector("#hint")!.textContent = HINTS[mode];
      saveSettings({ ...loadSettings(), last_mode: mode });
    }),
  );

  const onFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void startScan(file, mode);
  };
  root.querySelector("#camera")!.addEventListener("change", onFile);
  root.querySelector("#album")!.addEventListener("change", onFile);

  const recent = (await listScans()).slice(0, 3);
  if (recent.length) {
    root.querySelector("#recent")!.innerHTML = `
      <h2 class="section-title">최근 스캔 <a href="#/history">전체 보기</a></h2>
      <ul class="scan-list">${recent.map(scanRow).join("")}</ul>`;
  }
}

export function scanRow(s: import("../db").Scan): string {
  const icon = s.mode ? MODE_META[s.mode].icon : "⏳";
  const stars = s.rating ? `<span class="stars-sm">${"★".repeat(s.rating)}</span>` : "";
  const status = s.status === "pending" ? "해석 중…" : s.status === "error" ? "실패" : esc(s.subtitle);
  return `<li><a href="#/scan/${esc(s.id)}" class="scan-row">
    <img src="${s.thumb}" alt="" loading="lazy" />
    <div class="scan-text">
      <div class="scan-title">${icon} ${esc(s.title || "스캔")} ${stars}</div>
      <div class="scan-sub">${status}</div>
      <div class="scan-date">${formatDate(s.createdAt)}${s.memo ? " · 📝" : ""}</div>
    </div>
  </a></li>`;
}
