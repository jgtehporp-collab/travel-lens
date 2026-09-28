import type { Mode } from "../../shared/types";
import { listScans } from "../db";
import { MODE_META } from "../render";
import { scanRow } from "./home";

type Filter = "all" | Mode;
let filter: Filter = "all";
let favoritesOnly = false;

export async function renderHistory(root: HTMLElement): Promise<void> {
  const scans = await listScans();
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "전체" },
    ...(Object.keys(MODE_META) as Mode[]).map((m) => ({ key: m, label: `${MODE_META[m].icon} ${MODE_META[m].label}` })),
  ];

  root.innerHTML = `
    <header class="top"><h1>기록</h1></header>
    <div class="filters">
      ${filters.map((f) => `<button class="chip-btn" data-filter="${f.key}" aria-pressed="${filter === f.key}">${f.label}</button>`).join("")}
      <button class="chip-btn" id="fav" aria-pressed="${favoritesOnly}">⭐ 4점 이상</button>
    </div>
    <p class="muted small" id="count"></p>
    <ul class="scan-list" id="list"></ul>`;

  const draw = () => {
    const shown = scans.filter((s) => (filter === "all" || s.mode === filter) && (!favoritesOnly || s.rating >= 4));
    root.querySelector("#list")!.innerHTML = shown.length
      ? shown.map(scanRow).join("")
      : `<li class="empty">${scans.length ? "조건에 맞는 기록이 없어요" : "아직 스캔한 기록이 없어요 📷"}</li>`;
    root.querySelector("#count")!.textContent =
      filter === "sake" && favoritesOnly ? `맛있었던 사케 ${shown.length}개` : `${shown.length}개`;
    root.querySelectorAll<HTMLElement>("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
    root.querySelector("#fav")!.setAttribute("aria-pressed", String(favoritesOnly));
  };

  root.querySelectorAll<HTMLElement>("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter as Filter;
      draw();
    }),
  );
  root.querySelector("#fav")!.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    draw();
  });
  draw();
}
