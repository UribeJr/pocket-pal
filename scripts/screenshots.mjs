// Usage: npx next start -p 3107 then: node scripts/screenshots.mjs
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3107";
const views = { landscape: { width: 844, height: 390 }, portrait: { width: 390, height: 844 } };
const results = []; let failed = false;

for (const [bname, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await bt.launch({ args: bname === "chromium" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
  for (const [vname, vp] of Object.entries(views)) {
    for (const time of ["23:48", "14:10"]) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: bname === "chromium" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${BASE}/?time=${time}`, { waitUntil: "networkidle" });
      try { await page.waitForFunction(() => !!window.__pocketPal, null, { timeout: 20000 }); } catch (e) { console.log(bname, vname, "never ready", errors); await page.screenshot({ path: `screenshots/_fail-${bname}-${vname}.png` }); throw e; }
      await page.waitForTimeout(2500);
      const tag = `${bname}-${vname}-${time.startsWith("23") ? "night" : "day"}`;
      await page.screenshot({ path: `screenshots/${tag}.png` });
      // tap reaction (only once per browser/view to keep it quick)
      let tap = "skipped";
      if (time === "23:48") {
        const pos = await page.evaluate(() => window.__pocketPal.tuckScreenPos());
        await page.touchscreen.tap(pos.x, pos.y);
        await page.waitForTimeout(350);
        const st = await page.evaluate(() => { const s = window.__pocketPal.store.getState(); return { a: s.animation, e: s.emotion, n: s.tapCount, sp: s.speech }; });
        await page.screenshot({ path: `screenshots/${tag}-tap.png` });
        tap = st.n === 1 && st.a === "hop" && st.e === "excited" ? `ok (${st.a}/${st.e}, "${st.sp}")` : `FAIL ${JSON.stringify(st)}`;
        if (tap.startsWith("FAIL")) failed = true;
        // orientation switch must keep state
        const other = vname === "landscape" ? views.portrait : views.landscape;
        await page.setViewportSize(other); await page.waitForTimeout(1200);
        const after = await page.evaluate(() => { const s = window.__pocketPal.store.getState(); return { n: s.tapCount, layout: s.layout }; });
        const ok = after.n === 1 && after.layout === (vname === "landscape" ? "pocket" : "desk");
        tap += ok ? ` | rotate keeps state (${after.layout}, taps=${after.n})` : ` | ROTATE FAIL ${JSON.stringify(after)}`;
        if (!ok) failed = true;
        await page.screenshot({ path: `screenshots/${tag}-rotated.png` });
      }
      const errs = errors.filter((e) => !/GPU stall|WebGL.*(warning|performance)/i.test(e));
      if (errs.length) failed = true;
      results.push({ tag, errors: errs, tap });
      await ctx.close();
    }
  }
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
