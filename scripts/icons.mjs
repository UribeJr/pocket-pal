import { chromium } from "playwright";
import { readFileSync } from "fs";
const svg = readFileSync("public/icons/icon.svg", "utf8");
const b = await chromium.launch(); const p = await b.newPage();
for (const [name, size, pad] of [["icon-192", 192, 0], ["icon-512", 512, 0], ["icon-maskable-512", 512, 60], ["apple-touch-icon", 180, 0]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<body style="margin:0;background:#1E2433"><div style="padding:${pad}px;box-sizing:border-box;width:${size}px;height:${size}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body>`);
  await p.screenshot({ path: `public/icons/${name}.png` });
}
await b.close();
