import type { MenuResult } from "../../shared/types";
import { type Scan, deleteScan, getScan, updateScan } from "../db";
import { MODE_META, renderResult, skeleton } from "../render";
import { isInflight, runScan } from "../scan";
import { esc, formatDate, toast } from "../util";
import { openStaffView } from "./staff";

const LOADING_LINES = [
  "사진 속 글자를 읽는 중…",
  "현지 용어를 해석하는 중…",
  "맛을 상상하는 중…",
  "취향과 비교하는 중…",
  "알레르기 재료를 확인하는 중…",
  "거의 다 됐어요…",
];

let loadingTimer: number | undefined;

export async function renderScan(root: HTMLElement, id: string): Promise<void> {
  window.clearInterval(loadingTimer);
  const scan = await getScan(id);
  if (!scan) {
    root.innerHTML = `<header class="top"><a href="#/history" class="back">‹</a><h1>없는 기록</h1></header>
      <p class="empty">기록을 찾을 수 없어요.</p>`;
    return;
  }

  const modeLabel = scan.mode ? `${MODE_META[scan.mode].icon} ${MODE_META[scan.mode].label}` : "✨ 자동 감지";
  root.innerHTML = `
    <header class="top">
      <a href="#/" class="back" aria-label="뒤로">‹</a>
      <h1>${modeLabel}</h1>
      <button class="icon-btn" id="delete" aria-label="삭제">🗑</button>
    </header>
    <details class="photo">
      <summary><img src="${scan.thumb}" alt="" /><span>${formatDate(scan.createdAt)} · 원본 사진 보기</span></summary>
      <img src="${scan.image}" alt="촬영한 사진" class="full" />
    </details>
    <div id="body"></div>
    <div id="notes"></div>`;

  root.querySelector("#delete")!.addEventListener("click", async () => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await deleteScan(scan.id);
    toast("삭제했어요");
    location.hash = "#/history";
  });

  const body = root.querySelector<HTMLElement>("#body")!;
  if (scan.status === "pending") {
    if (!isInflight(scan.id)) {
      body.innerHTML = errorBlock("해석이 중단됐어요 (앱이 닫혔거나 네트워크가 끊겼을 수 있어요)");
      bindRetry(body, scan);
      return;
    }
    let i = 0;
    body.innerHTML = `<p class="loading" id="loading-line">${LOADING_LINES[0]}</p>${skeleton(scan.requestedMode)}`;
    loadingTimer = window.setInterval(() => {
      const el = document.getElementById("loading-line");
      if (!el) return window.clearInterval(loadingTimer);
      i = (i + 1) % LOADING_LINES.length;
      el.textContent = LOADING_LINES[i];
    }, 2200);
    return;
  }

  if (scan.status === "error") {
    body.innerHTML = errorBlock(scan.error ?? "오류가 발생했어요");
    bindRetry(body, scan);
    renderNotes(root, scan);
    return;
  }

  const res = scan.result!;
  if (res.data && scan.mode) {
    body.innerHTML = renderResult(scan.mode, res.data) + `<p class="model-note">모델: ${esc(res.model)}</p>`;
    if (scan.mode === "menu") bindStaff(root, body, res.data as MenuResult);
  } else {
    body.innerHTML = `
      <section class="card warn-card">
        <h3>⚠️ 결과를 카드로 정리하지 못했어요</h3>
        <p class="muted">모델의 원문 응답을 그대로 보여드려요.</p>
        <pre class="raw">${esc(res.raw)}</pre>
        <button class="btn" data-retry>다시 해석하기</button>
      </section>`;
    bindRetry(body, scan);
  }
  renderNotes(root, scan);
}

function errorBlock(message: string): string {
  const needsSettings = /토큰|설정/.test(message);
  return `<section class="card warn-card">
    <h3>😵 해석하지 못했어요</h3>
    <p>${esc(message)}</p>
    <div class="row">
      <button class="btn" data-retry>다시 시도</button>
      ${needsSettings ? `<a class="btn secondary" href="#/settings">설정 열기</a>` : ""}
    </div>
  </section>`;
}

function bindRetry(body: HTMLElement, scan: Scan): void {
  body.querySelector("[data-retry]")?.addEventListener("click", () => void runScan(scan.id));
}

function renderNotes(root: HTMLElement, scan: Scan): void {
  const notes = root.querySelector<HTMLElement>("#notes")!;
  notes.innerHTML = `
    <section class="card">
      <h3>내 평가</h3>
      <div class="stars" role="radiogroup" aria-label="별점">
        ${[1, 2, 3, 4, 5]
          .map((n) => `<button role="radio" aria-checked="${scan.rating === n}" data-star="${n}" class="${n <= scan.rating ? "on" : ""}">★</button>`)
          .join("")}
      </div>
      <textarea id="memo" rows="3" placeholder="메모 (어디서 마셨는지, 맛 후기 등)">${esc(scan.memo)}</textarea>
    </section>`;

  notes.querySelectorAll<HTMLButtonElement>("[data-star]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const n = Number(btn.dataset.star);
      const rating = scan.rating === n ? 0 : n; // 같은 별 다시 누르면 해제
      scan.rating = rating;
      await updateScan(scan.id, { rating });
      notes.querySelectorAll<HTMLButtonElement>("[data-star]").forEach((b) => {
        const v = Number(b.dataset.star);
        b.classList.toggle("on", v <= rating);
        b.setAttribute("aria-checked", String(v === rating));
      });
    }),
  );

  let memoTimer: number | undefined;
  notes.querySelector<HTMLTextAreaElement>("#memo")!.addEventListener("input", (e) => {
    window.clearTimeout(memoTimer);
    const memo = (e.target as HTMLTextAreaElement).value;
    memoTimer = window.setTimeout(() => void updateScan(scan.id, { memo }), 400);
  });
}

function bindStaff(root: HTMLElement, body: HTMLElement, data: MenuResult): void {
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.hidden = true;
  root.appendChild(fab);

  const picked = () =>
    Array.from(body.querySelectorAll<HTMLInputElement>("[data-pick]:checked")).map((c) => data.items[Number(c.dataset.pick)]);

  body.addEventListener("change", (e) => {
    if (!(e.target as HTMLElement).matches("[data-pick]")) return;
    const n = picked().length;
    fab.hidden = n === 0;
    fab.textContent = `🙋 직원에게 보여주기 (${n})`;
  });
  fab.addEventListener("click", () => openStaffView(data, picked()));
}
