// Focus buddy e2e (no chat bar, long-press talk, timer w/ fake time, behaviours, env, reload, clip fallback).
// Usage: npx next start -p 3107; node scripts/focus-e2e.mjs
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3107";
const results = []; let failed = false;
const check = (r, cond, msg) => { r.steps.push((cond ? "ok " : "FAIL ") + msg); if (!cond) failed = true; };
const phase = (page) => page.getAttribute('[data-testid="focus-readout"]', "data-phase").catch(() => null);

for (const [bname, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await bt.launch({ args: bname === "chromium" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
  for (const [mode, vp] of [["desk", { width: 844, height: 390 }], ["pocket", { width: 390, height: 844 }]]) {
    const r = { run: `${bname}-${mode}`, steps: [] }; results.push(r);
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });
    const page = await ctx.newPage(); const errors = []; let reacts = 0;
    page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("request", (q) => q.url().includes("/api/react") && reacts++);
    const ready = async () => { await page.waitForFunction(() => !!window.__pocketPal?.controller, null, { timeout: 20000 }); await page.waitForTimeout(800); };
    const shot = (n) => bname === "chromium" ? page.screenshot({ path: `screenshots/focus-${mode}-${n}.png` }) : null;
    try {
      await page.goto(`${BASE}/?time=14:10`); await ready();
      check(r, !(await page.$('[data-testid="desk-chat-open"]')) && !(await page.$('[data-testid="chat-input"]')), "no default chat bar");
      // long-press talk
      const p = await page.evaluate(() => window.__pocketPal.tuckScreenPos());
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
      const talk = await page.waitForSelector('[data-testid="chat-input"]', { timeout: 4000 }).then(() => true).catch(() => false);
      check(r, talk, "long-press opens talk input");
      await page.click('[aria-label="Close talk"]').catch(() => {});
      check(r, !(await page.$('[data-testid="chat-input"]')), "talk closes");
      // quick tap is still a tap, not talk
      const taps0 = await page.evaluate(() => window.__pocketPal.store.getState().tapCount);
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(300);
      const taps1 = await page.evaluate(() => window.__pocketPal.store.getState().tapCount);
      check(r, taps1 === taps0 + 1 && !(await page.$('[data-testid="chat-input"]')), "short tap = tap");
      await page.evaluate(() => window.__pocketPal.controller.returnToIdle());
      // behaviours cycle
      const kinds = await page.evaluate(() => { const { behavior: b, controller: c, engineContext } = window.__pocketPal; for (let i = 0; i < 60; i++) { b.decide(engineContext()); c.returnToIdle(); b.t += 40; } return [...new Set(b.history)]; });
      check(r, kinds.length >= 4 && kinds.includes("quiet"), `behaviours cycle: ${kinds.join(",")}`);
      check(r, mode === "desk" || !kinds.includes("wander"), "pocket: no walking");
      // environment interactions
      if (mode === "desk") for (const id of ["inspectClock", "gazeWindow", "inspectPlant"]) {
        const label = await page.evaluate((id) => { const { behavior: b, engineContext, controller: c } = window.__pocketPal; c.returnToIdle(); b.decide(engineContext(), id); return c.activeLabel; }, id);
        await page.waitForTimeout(1500);
        const busy = await page.evaluate(() => window.__pocketPal.controller.activePriority);
        check(r, label === id && busy === 1, `env interaction ${id} runs (prio ${busy})`);
      }
      await page.evaluate(() => window.__pocketPal.controller.returnToIdle());
      // missing clip fallback
      const fb = await page.evaluate(() => window.__pocketPal.controller.run([{ kind: "play", clip: "doesNotExist", fallback: ["lookAround"] }], 2, "fb"));
      check(r, fb === "done", `missing clip falls back (${fb})`);
      // focus timer
      const reactsBefore = reacts;
      await page.click('[data-testid="focus-chip"]');
      await page.click('[data-testid="focus-start-25"]');
      await page.waitForTimeout(6000);
      check(r, (await phase(page)) === "focus", "timer started: focus");
      await page.waitForFunction(() => /sit/.test(window.__pocketPal.store.getState().animation), null, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const anim = await page.evaluate(() => window.__pocketPal.store.getState().animation);
      check(r, /sit/.test(anim), `seated during focus (${anim})`);
      await shot("session");
      const rem1 = await page.textContent('[data-testid="focus-remaining"]');
      await page.reload(); await ready();
      const rem2 = await page.textContent('[data-testid="focus-remaining"]').catch(() => null);
      check(r, (await phase(page)) === "focus" && rem2 && rem2.slice(0, 2) === rem1.slice(0, 2), `reload keeps timer (${rem1} -> ${rem2})`);
      await page.setViewportSize({ width: vp.height, height: vp.width }); await page.waitForTimeout(1200);
      check(r, (await phase(page)) === "focus", "rotation keeps timer");
      await page.setViewportSize(vp); await page.waitForTimeout(1200);
      await page.evaluate(() => window.__pocketPal.clock.advance(25 * 60e3));
      await page.waitForFunction(() => document.querySelector('[data-testid="focus-readout"]')?.dataset.phase === "break", null, { timeout: 5000 }).catch(() => {});
      check(r, (await phase(page)) === "break", "break after 25 min");
      await page.waitForTimeout(3500); await shot("break");
      const breakHist = await page.evaluate(() => window.__pocketPal.controller.activeLabel);
      check(r, !!breakHist, `break celebration runs (${breakHist})`);
      await page.waitForTimeout(6000);
      await page.evaluate(() => window.__pocketPal.clock.advance(5 * 60e3 + 1000));
      await page.waitForFunction(() => document.querySelector('[data-testid="focus-readout"]')?.dataset.phase === "done", null, { timeout: 5000 }).catch(() => {});
      check(r, (await phase(page)) === "done", "done after break");
      await page.waitForTimeout(1500); await shot("finish");
      check(r, reacts - reactsBefore >= 1 && reacts - reactsBefore <= 4, `AI called only at moments (${reacts - reactsBefore} calls)`);
      await page.evaluate(() => window.__pocketPal.clock.reset());
      const errs = errors.filter((e) => !/GPU stall|WebGL.*(warning|performance)/i.test(e));
      check(r, !errs.length, `console errors: ${errs.join(" | ") || "none"}`);
    } catch (e) { check(r, false, "exception " + String(e).split("\n")[0]); await page.screenshot({ path: `screenshots/_fail-${r.run}.png` }); }
    await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
process.exit(failed ? 1 : 0);
