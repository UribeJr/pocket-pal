// GLB Tuck checks (Phase 5). Usage: npm run build && npx next start -p 3107, then: node scripts/glb-e2e.mjs
// Env: BASE (default http://localhost:3107), SOAK_SECONDS (default 60), OUT (screenshot dir, default screenshots)
// Prints a JSON report; exit code 1 on any failure. Expects the GLB renderer (the default build).
import { chromium, webkit } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3107";
const SOAK = Number(process.env.SOAK_SECONDS ?? 60);
const OUT = process.env.OUT ?? "screenshots";
mkdirSync(OUT, { recursive: true });
const views = { landscape: { width: 844, height: 390 }, portrait: { width: 390, height: 844 } };
const report = []; let failed = false;
const wait = (page, ms) => page.waitForTimeout(ms);

for (const [bname, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await bt.launch({ args: bname === "chromium" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
  const ctx = await browser.newContext({ viewport: views.landscape, deviceScaleFactor: 2, hasTouch: true, isMobile: bname === "chromium" });
  const page = await ctx.newPage();
  const r = { browser: bname, checks: [], metrics: {} };
  const check = (ok, msg) => { r.checks.push(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed = true; };
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = (n) => page.screenshot({ path: `${OUT}/glb-${bname}-${n}.png` });
  const dbg = () => page.evaluate(() => window.__pocketPal.backend.debug());
  const st = () => page.evaluate(() => { const s = window.__pocketPal.store.getState(); return { animation: s.animation, emotion: s.emotion, behavior: s.behavior, layout: s.layout, tapCount: s.tapCount, posX: s.posX, facing: s.facing, speech: s.speech }; });
  try {
    // 1. load
    const t0 = Date.now();
    await page.goto(`${BASE}/?time=14:10`, { waitUntil: "load" });
    await page.waitForFunction(() => !!window.__pocketPal, null, { timeout: 30000 });
    r.metrics.readyMs = Date.now() - t0;
    r.metrics.glb = await page.evaluate(() => { const e = performance.getEntriesByType("resource").find((x) => x.name.includes("/models/tuck.glb")); return e ? { ms: Math.round(e.duration), bytes: e.transferSize || e.encodedBodySize || null } : null; });
    await wait(page, 1500);
    const info = await page.evaluate(() => ({ renderer: window.__pocketPal.renderer, baked: window.__pocketPal.backend.debug?.().baked ?? [] }));
    check(info.renderer === "glb", `renderer = ${info.renderer}`);
    check(info.baked.length === 6, `baked legacy clips: ${info.baked.join(", ")}`);
    await shot("desk-day");

    // 2. face follows emotion, speech moves the mouth
    await page.evaluate(() => window.__pocketPal.controller.setEmotion("playful", 2, 3));
    await wait(page, 600);
    let face = (await dbg()).face;
    check(face.face === "happy" && face.influences.Eye_Happy > 0.9, `emotion playful -> happy face (Eye_Happy ${face.influences.Eye_Happy?.toFixed(2)})`);
    await page.evaluate(() => window.__pocketPal.controller.say("Hello there! How are you today?", 3));
    let mouth = 0;
    for (let i = 0; i < 15; i++) { await wait(page, 100); const f = (await dbg()).face.influences; mouth = Math.max(mouth, (f.Mouth_Open ?? 0) + (f.Mouth_O ?? 0) + (f.Mouth_Wide ?? 0)); }
    check(mouth > 0.4, `talking moves the mouth (peak viseme ${mouth.toFixed(2)})`);
    await shot("talking");

    // 3. tap
    await page.evaluate(() => window.__pocketPal.controller.returnToIdle());
    await wait(page, 800);
    let pos = await page.evaluate(() => window.__pocketPal.tuckScreenPos());
    await page.touchscreen.tap(pos.x, pos.y);
    await wait(page, 350);
    let s = await st();
    check(s.tapCount === 1 && s.animation === "hop" && s.emotion === "excited", `tap -> ${s.animation}/${s.emotion}, taps=${s.tapCount}`);
    // simulation time can run slower than the wall clock on software GL (dt is capped at 1/20 s), so wait on state
    const happy = await page.waitForFunction(() => window.__pocketPal.backend.debug().log.some((l) => l.name === "happy"), null, { timeout: 8000 }).then(() => true, () => false);
    check(happy, "tap reaction continues into the baked happy");

    // 4. walk: facing 1.2 rad, rate synced, stops cleanly
    await wait(page, 1500);
    const startX = (await st()).posX;
    const target = startX > 0 ? startX - 0.9 : startX + 0.9;
    await page.evaluate((x) => { void window.__pocketPal.controller.run([{ kind: "moveTo", x }, { kind: "wait", seconds: 1 }], 2, "e2e-walk"); }, target);
    await wait(page, 1000);
    s = await st(); let d = await dbg();
    check(Math.abs(Math.abs(s.facing) - 1.2) < 0.08 && d.inCharge === "walk", `walking: |yaw| ${Math.abs(s.facing).toFixed(2)}, clip ${d.inCharge}`);
    // expected rate = actual speed along the facing / 0.45 = max(0.35, emotion speed) * sin(|yaw|)
    const emoSpeed = await page.evaluate(() => Math.max(0.35, window.__pocketPal.controller.emotions.style.speed || 0));
    const wantTs = emoSpeed * Math.sin(Math.abs(s.facing));
    check(Math.abs(d.walkTimeScale - wantTs) < 0.08, `walk rate synced to speed (timeScale ${d.walkTimeScale?.toFixed(2)}, expected ${wantTs.toFixed(2)})`);
    await shot("walking");
    await wait(page, 2200);
    d = await dbg();
    check(d.inCharge !== "walk", `no walking in place after arrival (in charge: ${d.inCharge})`);

    // 5. seated sleep and an instant wake
    await page.evaluate(() => { const c = window.__pocketPal.controller; c.setEmotion("sleepy", 1, Infinity); c.returnToIdle(); });
    await wait(page, 300);
    d = await dbg();
    check(d.inCharge === "sitDown" && d.queue.includes("sleep"), `sleep entry routes through sitDown (${d.inCharge} > ${d.queue.join(",")})`);
    await wait(page, 2200);
    d = await dbg();
    check(d.inCharge === "sleep" && d.pose === "SLEEP_SIT" && d.face.face === "sleepy", `asleep: ${d.inCharge}/${d.pose}, face ${d.face.face}`);
    await shot("sleeping");
    pos = await page.evaluate(() => window.__pocketPal.tuckScreenPos());
    const tapAt = Date.now();
    await page.touchscreen.tap(pos.x, pos.y);
    await page.waitForFunction(() => window.__pocketPal.backend.debug().inCharge === "hop", null, { timeout: 2000 });
    r.metrics.wakeTapToHopMs = Date.now() - tapAt;
    check(r.metrics.wakeTapToHopMs < 600, `tap while asleep -> hop in ${r.metrics.wakeTapToHopMs} ms (urgent route)`);
    await wait(page, 2500);

    // 6. autonomous wake goes through wakeUp
    await page.evaluate(() => { const c = window.__pocketPal.controller; c.setEmotion("sleepy", 3, Infinity); c.returnToIdle(); });
    await wait(page, 2600);
    await page.evaluate(() => { const c = window.__pocketPal.controller; c.setEmotion("content", 3, 0); void c.run([{ kind: "play", clip: "wakeUp", fallback: ["lookAround"] }], 1, "e2e-wake"); });
    await wait(page, 300);
    d = await dbg();
    check(d.inCharge === "wakeUp", `autonomous wake plays wakeUp (${d.inCharge})`);
    await wait(page, 2800);
    check((await dbg()).pose === "STAND", "standing after wakeUp");

    // 7. rotation keeps state and the same backend
    await page.evaluate(() => { window.__e2eBackend = window.__pocketPal.backend; });
    await page.setViewportSize(views.portrait); await wait(page, 1500);
    s = await st();
    const same = await page.evaluate(() => window.__pocketPal?.backend === window.__e2eBackend);
    check(s.layout === "pocket" && same, `portrait -> ${s.layout}, same backend: ${same}`);
    await shot("pocket");
    await page.setViewportSize(views.landscape); await wait(page, 1200);
    check((await st()).layout === "desk", "landscape -> desk");

    // 8. background and resume (Chromium: page lifecycle freeze; WebKit: not scriptable here)
    if (bname === "chromium") {
      const cdp = await ctx.newCDPSession(page);
      const before = (await dbg()).log.length;
      const clk = await page.evaluate(() => window.__pocketPal.backend.debug().time);
      await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
      await new Promise((res) => setTimeout(res, 3000));
      await cdp.send("Page.setWebLifecycleState", { state: "active" });
      await wait(page, 1000);
      const after = await page.evaluate(() => window.__pocketPal.backend.debug().time);
      check(after !== clk || (await dbg()).log.length !== before, "animation resumes after freeze -> active");
    }

    // 9. soak: frame rate, memory, renderer resources, React renders
    const sample = () => page.evaluate(async () => {
      const gl = window.__pocketPal.gl();
      let frames = 0; const t = performance.now();
      await new Promise((res) => { const f = () => { frames++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      return { fps: frames, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, calls: gl.info.render.calls, triangles: gl.info.render.triangles, renders: window.__pocketPal.renders() };
    });
    const samples = [await sample()];
    const t1 = Date.now();
    while (Date.now() - t1 < SOAK * 1000) { await wait(page, 9000); samples.push(await sample()); }
    r.metrics.soak = { seconds: SOAK, samples };
    const first = samples[0], last = samples.at(-1);
    check(last.geometries <= first.geometries + 2 && last.textures <= first.textures + 2, `soak ${SOAK}s: geometries ${first.geometries}->${last.geometries}, textures ${first.textures}->${last.textures}`);
    const rendersPerMin = ((last.renders - first.renders) / Math.max(1, (Date.now() - t1) / 60000));
    r.metrics.tuckRendersPerMinute = +rendersPerMin.toFixed(1);
    check(rendersPerMin < 60, `Tuck shell re-renders ${rendersPerMin.toFixed(1)}/min during idle`);
    await shot("after-soak");

    const errs = errors.filter((e) => !/GPU stall|WebGL.*(warning|performance)/i.test(e));
    check(errs.length === 0, `console errors: ${errs.length ? errs.join(" | ") : "none"}`);
  } catch (e) {
    check(false, "exception " + String(e).split("\n")[0]);
    await page.screenshot({ path: `${OUT}/_fail-glb-${bname}.png` }).catch(() => {});
  }
  report.push(r);
  await browser.close();
}
writeFileSync(`${OUT}/glb-e2e-report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(failed ? 1 : 0);
