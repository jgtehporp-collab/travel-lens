import type { MenuItem, MenuResult } from "../../shared/types";
import { esc } from "../util";

// 모델이 staff_phrases를 못 준 경우를 위한 기본 문장
const FALLBACK_ORDER: [RegExp, string][] = [
  [/일본/, "これをください"],
  [/중국|대만|광둥|번체|간체/, "我要这个，谢谢。"],
  [/프랑스/, "Je voudrais ceci, s'il vous plaît."],
  [/이탈리아/, "Vorrei questo, per favore."],
  [/스페인/, "Quisiera esto, por favor."],
  [/포르투갈/, "Queria isto, por favor."],
  [/독일/, "Ich hätte gern das, bitte."],
  [/태국/, "เอาอันนี้ค่ะ/ครับ"],
  [/베트남/, "Cho tôi món này."],
];

function orderPhrase(data: MenuResult): string {
  if (data.staff_phrases?.order) return data.staff_phrases.order;
  return FALLBACK_ORDER.find(([re]) => re.test(data.language ?? ""))?.[1] ?? "I'd like this, please.";
}

export function openStaffView(data: MenuResult, items: MenuItem[]): void {
  const overlay = document.createElement("div");
  overlay.className = "staff";
  overlay.setAttribute("role", "dialog");
  overlay.innerHTML = `
    <button class="staff-close" aria-label="닫기">✕</button>
    <div class="staff-body">
      <p class="staff-phrase">${esc(orderPhrase(data))}</p>
      <ul class="staff-items">
        ${items.map((it) => `<li><span class="staff-orig">${esc(it.original)}</span><small>${esc(it.korean_name)}</small></li>`).join("")}
      </ul>
      ${data.staff_phrases?.allergy_notice ? `<p class="staff-allergy">⚠️ ${esc(data.staff_phrases.allergy_notice)}</p>` : ""}
      <p class="staff-thanks">🙏</p>
    </div>`;
  const close = () => {
    overlay.remove();
    document.body.classList.remove("no-scroll");
  };
  overlay.querySelector(".staff-close")!.addEventListener("click", close);
  window.addEventListener("hashchange", close, { once: true });
  document.body.classList.add("no-scroll");
  document.body.appendChild(overlay);
}
