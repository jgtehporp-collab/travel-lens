// public/icons/icon.svg → PNG 아이콘 생성 (Playwright의 Chromium 사용)
// 실행: npm run icons   (playwright가 설치돼 있어야 함: npx playwright 또는 전역 설치)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(`${process.env.NODE_PATH ?? "/opt/node22/lib/node_modules"}/playwright`));
}

const svg = readFileSync("public/icons/icon.svg", "utf8");
const targets = [
  { file: "apple-touch-icon.png", size: 180, pad: 0, square: true },
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  { file: "icon-maskable-512.png", size: 512, pad: 0.1, square: true },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const t of targets) {
  // iOS·maskable 아이콘은 투명 모서리 없이 꽉 채운 정사각형이어야 한다
  const inner = t.square ? svg.replace('rx="112"', 'rx="0"') : svg;
  const padPx = Math.round(t.size * t.pad);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.square ? "#b4432f" : "transparent"}">
      <div style="width:${t.size}px;height:${t.size}px;padding:${padPx}px;box-sizing:border-box">${inner.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
    </body></html>`,
  );
  writeFileSync(`public/icons/${t.file}`, await page.screenshot({ omitBackground: !t.square }));
  console.log("wrote", t.file);
}
await browser.close();
