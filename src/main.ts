import "./styles.css";
import { refreshRateIfStale } from "./api";
import { SCAN_UPDATED } from "./scan";
import { renderHistory } from "./views/history";
import { renderHome } from "./views/home";
import { renderScan } from "./views/scan";
import { renderSettings } from "./views/settings";

const view = document.getElementById("view")!;
const nav = document.getElementById("tabbar")!;

function currentRoute(): { name: "home" | "scan" | "history" | "settings"; id?: string } {
  const [, name, id] = location.hash.replace(/^#/, "").split("/");
  if (name === "scan" && id) return { name: "scan", id };
  if (name === "history") return { name: "history" };
  if (name === "settings") return { name: "settings" };
  return { name: "home" };
}

async function route(): Promise<void> {
  const r = currentRoute();
  document.querySelectorAll(".fab").forEach((el) => el.remove());
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.route === (r.name === "scan" ? "history" : r.name)));
  if (r.name === "scan") await renderScan(view, r.id!);
  else if (r.name === "history") await renderHistory(view);
  else if (r.name === "settings") await renderSettings(view);
  else await renderHome(view);
  if (r.name !== "scan") window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => void route());
window.addEventListener(SCAN_UPDATED, (e) => {
  const r = currentRoute();
  if (r.name === "scan" && r.id === (e as CustomEvent<string>).detail) void route();
void refreshRateIfStale();
});

void route();
void refreshRateIfStale();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
}
