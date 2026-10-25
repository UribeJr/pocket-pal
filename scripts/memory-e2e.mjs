// Memory + session persistence e2e (route fixture, no Groq). Usage: npx next start -p 3107; node scripts/memory-e2e.mjs
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3107";
const fixture = (mem) => JSON.stringify({ ok: true, reply: { dialogue: "pokémon. respectable.", emotion: "excited", action: "hop", memory_candidate: mem } });
const results = []; let failed = false;
const check = (r, cond, msg) => { r.steps.push((cond ? "ok " : "FAIL ") + msg); if (!cond) failed = true; };

for (const [bname, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await bt.launch({ args: bname === "chromium" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
  for (const [mode, vp] of [["desk", { width: 844, height: 390 }], ["pocket", { width: 390, height: 844 }]]) {
    const r = { run: `${bname}-${mode}`, steps: [] }; results.push(r);
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    let mem = { kind: "likes", value: "pokémon" };
    await page.route("**/api/conversation", (route) => route.fulfill({ status: 200, contentType: "application/json", body: fixture(mem) }));
    const ready = async () => { await page.waitForFunction(() => !!window.__pocketPal?.controller, null, { timeout: 20000 }); await page.waitForTimeout(800); };
    const openMemory = async () => { await page.click('[data-testid="settings-open"]'); await page.click('[data-testid="memory-open"]'); };
    const send = async (t) => { if (!(await page.$('[data-testid="chat-input"]'))) { const p = await page.evaluate(() => window.__pocketPal.tuckScreenPos()); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up(); await page.waitForSelector('[data-testid="chat-input"]', { timeout: 4000 }); } await page.fill('[data-testid="chat-input"]', t); await page.keyboard.press("Enter"); };
    try {
      await page.goto(`${BASE}/?time=14:10`); await ready();
      // you're back after 2h away (session persistence + catch-up)
      // (pagehide flushes lastActiveAt on reload, so rewind it before the app boots on the next load)
      await page.addInitScript(() => { if (sessionStorage.getItem("rewound")) return; sessionStorage.setItem("rewound", "1"); const k = "pocketpal:v1:session"; const s = JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify({ ...s, mood: "excited", lastActiveAt: Date.now() - 2 * 3600e3 })); });
      await page.reload(); await ready();
      const back = await page.waitForFunction(() => window.__pocketPal.store.getState().speech, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
      check(r, back === "oh, you're back.", `welcome-back line: ${back}`);
      await page.waitForTimeout(3500);
      // chat -> chip -> accept
      await send("i love pokémon");
      await page.waitForSelector('[data-testid="memory-chip"]', { timeout: 8000 });
      await page.screenshot({ path: `screenshots/${bname}-${mode}-memory-chip.png` });
      const before = await page.evaluate(() => localStorage.getItem("pocketpal:v1:memory"));
      check(r, !before || !before.includes("pok"), "nothing saved before ✓");
      await page.click('[data-testid="memory-accept"]');
      check(r, (await page.evaluate(() => localStorage.getItem("pocketpal:v1:memory"))).includes("pokémon"), "saved after ✓");
      // reload persistence
      await page.reload(); await ready();
      await openMemory(); // memory lives in Settings now, in both layouts
      check(r, (await page.textContent('[data-testid="memory-list"]')).includes("pokémon"), "fact listed after reload");
      await page.screenshot({ path: `screenshots/${bname}-${mode}-memory-sheet.png` });
      await page.click('[data-testid="memory-delete"]');
      await page.reload(); await ready(); await openMemory();
      check(r, (await page.textContent('[data-testid="memory-list"]')).includes("Nothing yet"), "deleted fact gone after reload");
      // off switch: no chip, nothing stored
      await page.click('[data-testid="memory-toggle"]'); await page.click('[aria-label="Close memories"]');
      await send("i love zelda"); mem = { kind: "likes", value: "zelda" };
      await page.waitForTimeout(1500);
      check(r, !(await page.$('[data-testid="memory-chip"]')), "memory off -> no chip");
      check(r, await page.evaluate(() => JSON.parse(localStorage.getItem("pocketpal:v1:memory")).enabled === false), "off switch persisted");
      await page.waitForFunction(() => window.__pocketPal.controller.activePriority === 0, null, { timeout: 15000 });
      check(r, true, "Tuck back to routine");
    } catch (e) { check(r, false, e.message.split("\n")[0]); }
    const errs = errors.filter((e) => !/GPU stall|WebGL/i.test(e)); check(r, !errs.length, `console errors: ${errs.length ? errs.join(" | ") : "none"}`);
    await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(results, null, 1)); process.exit(failed ? 1 : 0);
