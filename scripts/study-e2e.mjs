// Study with Tuck e2e: Pomodoro (timestamps + fake time), Tuck following the session, Ask Tuck, behaviours.
// Usage: npm run build && npx next start -p 3107, then: node scripts/study-e2e.mjs   (Chromium + WebKit, desk + pocket)
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3107";
const results = []; let failed = false;
const check = (r, cond, msg) => { r.steps.push((cond ? "ok " : "FAIL ") + msg); if (!cond) failed = true; };
const readout = (page) => page.evaluate(() => { const el = document.querySelector('[data-testid="focus-readout"]'); return el ? { phase: el.dataset.phase, status: el.dataset.status, text: el.textContent } : null; });
const studyFixture = JSON.stringify({ ok: true, reply: { dialogue: "okay, three steps.", emotion: "focused", action: "hop", memory_candidate: null }, answer: "Mitosis in short:\n\n- **Prophase**: chromosomes condense\n- **Metaphase**: they line up\n- **Anaphase**: they pull apart" });

for (const [bname, bt] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await bt.launch({ args: bname === "chromium" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
  for (const [mode, vp] of [["desk", { width: 844, height: 390 }], ["pocket", { width: 390, height: 844 }]]) {
    const r = { run: `${bname}-${mode}`, steps: [] }; results.push(r);
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });
    const page = await ctx.newPage(); const errors = []; let reacts = 0; let convo = 0;
    page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("request", (q) => { if (q.url().includes("/api/react")) reacts++; if (q.url().includes("/api/conversation")) convo++; });
    const momentFixture = (m) => m === "start" ? JSON.stringify({ ok: true, reply: { dialogue: "Let's draft the intro. Just that.", emotion: "excited", action: "none", memory_candidate: null }, answer: "", goal: "Draft the intro paragraph" })
      : m === "checkin" ? JSON.stringify({ ok: true, reply: { dialogue: "You did it! Next up: one argument.", emotion: "excited", action: "none", memory_candidate: null }, answer: "", goal: "Write the first argument" })
      : studyFixture;
    await page.route("**/api/conversation", (route) => route.fulfill({ status: 200, contentType: "application/json", body: momentFixture(JSON.parse(route.request().postData() ?? "{}").moment) }));
    const ready = async () => { await page.waitForFunction(() => !!window.__pocketPal?.controller, null, { timeout: 30000 }); await page.waitForTimeout(800); };
    const shot = (n) => bname === "chromium" ? page.screenshot({ path: `screenshots/study-${mode}-${n}.png` }) : null;
    const advance = async (ms) => { await page.evaluate((ms) => window.__pocketPal.clock.advance(ms), ms); await page.waitForTimeout(1600); };
    const anim = () => page.evaluate(() => window.__pocketPal.store.getState().animation);
    try {
      await page.goto(`${BASE}/?time=14:10`); await ready();
      await page.evaluate(() => { window.__pocketPal.clock.reset(); });
      // the layout: clock + controls + Ask Tuck entry; no chat open, no room
      const r0 = await readout(page);
      check(r, r0?.text?.includes("25:00") && r0.status === "ready", `starts ready at 25:00 (${r0?.text})`);
      check(r, !!(await page.$('[data-testid="ask-open"]')) && !(await page.$('[data-testid="chat-input"]')), "Ask Tuck entry visible, chat closed");
      // long-press still opens Ask Tuck; Escape closes it
      const p = await page.evaluate(() => window.__pocketPal.tuckScreenPos());
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
      check(r, await page.waitForSelector('[data-testid="chat-input"]', { timeout: 4000 }).then(() => true).catch(() => false), "long-press opens Ask Tuck");
      await page.keyboard.press("Escape"); await page.waitForTimeout(300);
      check(r, !(await page.$('[data-testid="chat-input"]')), "Escape closes Ask Tuck");
      // a short tap is still a tap
      const taps0 = await page.evaluate(() => window.__pocketPal.store.getState().tapCount);
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(300);
      check(r, (await page.evaluate(() => window.__pocketPal.store.getState().tapCount)) === taps0 + 1, "short tap = tap reaction");
      await page.waitForTimeout(2500);
      // ready-state behaviours: varied, quiet dominant, never walking off his spot
      const beh = await page.evaluate(() => { const { behavior: b, controller: c, engineContext } = window.__pocketPal; for (let i = 0; i < 60; i++) { b.decide(engineContext()); c.returnToIdle(); b.t += 60; } return { kinds: [...new Set(b.history)], posX: window.__pocketPal.store.getState().posX }; });
      check(r, beh.kinds.length >= 3 && beh.kinds.includes("quiet") && !beh.kinds.includes("wander"), `ready behaviours: ${beh.kinds.join(",")}`);
      check(r, Math.abs(beh.posX) < 0.05, `stays on his spot (x ${beh.posX.toFixed(2)})`);
      const fb = await page.evaluate(() => window.__pocketPal.controller.run([{ kind: "play", clip: "doesNotExist", fallback: ["lookAround"] }], 2, "fb"));
      check(r, fb === "done", `missing clip falls back (${fb})`);

      // ---- focus ----
      await page.click('[data-testid="focus-start"]');
      await page.waitForTimeout(1500);
      let ro = await readout(page);
      check(r, ro.phase === "focus" && ro.status === "running" && /24:5\d/.test(ro.text), `Start -> focus running (${ro.text})`);
      await page.waitForFunction(() => /sit/.test(window.__pocketPal.store.getState().animation), null, { timeout: 20000 }).catch(() => {});
      check(r, /sit/.test(await anim()), `Tuck sits to study (${await anim()})`);
      await shot("focus");
      // pause holds, resume continues
      await page.click('[data-testid="focus-start"]'); await page.waitForTimeout(400);
      const pausedA = (await readout(page)).text; await advance(60_000); const pausedB = await readout(page);
      check(r, pausedB.status === "paused" && pausedA === pausedB.text, `pause holds (${pausedB.text})`);
      check(r, /sit/.test(await anim()), "still seated while paused");
      await page.click('[data-testid="focus-start"]'); await page.waitForTimeout(400);
      check(r, (await readout(page)).status === "running", "resume");
      // reload + rotation keep the session
      const before = (await readout(page)).text;
      await page.reload(); await ready();
      const after = await readout(page);
      check(r, after.phase === "focus" && after.status === "running" && after.text.slice(-5, -3) === before.slice(-5, -3), `reload keeps timer (${before.slice(-5)} -> ${after.text.slice(-5)})`);
      await page.setViewportSize({ width: vp.height, height: vp.width }); await page.waitForTimeout(1200);
      check(r, (await readout(page)).phase === "focus", "rotation keeps timer");
      await page.setViewportSize(vp); await page.waitForTimeout(1000);
      // a frozen (backgrounded) tab is on time when it wakes
      if (bname === "chromium") {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
        await cdp.send("Page.setWebLifecycleState", { state: "active" });
        await page.waitForTimeout(800);
        check(r, (await readout(page)).status === "running", "frozen tab resumes running");
      }
      // ---- focus complete -> auto short break ----
      await advance(25 * 60e3);
      ro = await readout(page);
      check(r, ro.phase === "break" && ro.status === "running" && /short break/i.test(ro.text), `auto short break (${ro.text})`);
      const label = await page.evaluate(() => window.__pocketPal.controller.activeLabel);
      check(r, label === "study:focusDone", `Tuck celebrates (${label})`);
      await page.waitForTimeout(2500); await shot("break");
      // ---- break over -> focus waits for Start ----
      await advance(5 * 60e3 + 1000);
      ro = await readout(page);
      check(r, ro.status === "ready" && /25:00/.test(ro.text) && /2 of 4/i.test(ro.text), `break over, next focus ready (${ro.text})`);
      // ---- skip a focus: not counted ----
      await page.click('[data-testid="focus-start"]'); await page.waitForTimeout(500);
      await page.click('[data-testid="focus-skip"]'); await page.waitForTimeout(500);
      ro = await readout(page);
      const counted = await page.textContent(".study-controls");
      check(r, ro.phase === "break" && /1 session today/.test(counted), `skip focus -> break, not counted (${ro.text} · ${counted.trim()})`);
      await page.click('[data-testid="focus-skip"]'); await page.waitForTimeout(500);
      check(r, (await readout(page)).status === "ready", "skip break -> ready focus");
      // ---- long break after the 4th completed focus ----
      for (let i = 0; i < 3; i++) {
        await page.click('[data-testid="focus-start"]'); await page.waitForTimeout(400);
        await advance(25 * 60e3);
        if (i < 2) await advance(5 * 60e3 + 1000);
      }
      ro = await readout(page);
      check(r, /long break/i.test(ro.text) && ro.status === "running", `4th focus -> long break (${ro.text})`);
      const count = await page.evaluate(() => window.__pocketPal.pomodoro.getState().completedToday);
      check(r, count === 4, `4 sessions counted (${count})`);
      // ---- reset ----
      page.once("dialog", (d) => d.accept());
      await page.click('[data-testid="focus-cancel"]'); await page.waitForTimeout(500);
      check(r, (await readout(page)).status === "ready", "reset -> ready focus");
      check(r, reacts === 0, `timer moments never call the AI (${reacts} /api/react calls)`);

      // ---- focus partner: task -> goal at Start; "did you finish?" at the break -> next goal ----
      await page.fill('[data-testid="focus-task"]', "my history essay");
      await page.click('[data-testid="focus-start"]');
      const goal1 = await page.waitForSelector('[data-testid="focus-goal"]', { timeout: 8000 }).then((h) => h.textContent()).catch(() => "");
      check(r, /Draft the intro paragraph/.test(goal1 ?? ""), `Start with a task -> goal line (${goal1})`);
      await advance(25 * 60e3);
      const card = await page.waitForSelector('[data-testid="checkin"]', { timeout: 8000 }).then(() => true).catch(() => false);
      check(r, card, "focus done -> 'did you finish?' card");
      if (card) {
        await page.click('[data-testid="checkin-yes"]');
        const goal2 = await page.waitForFunction(() => document.querySelector('[data-testid="focus-goal"]')?.textContent?.includes("Write the first argument"), null, { timeout: 8000 }).then(() => true).catch(() => false);
        check(r, goal2, "check-in answer -> Tuck suggests the next goal");
        const said = await page.waitForFunction(() => window.__pocketPal.store.getState().speech?.startsWith("You did it"), null, { timeout: 15000 }).then(() => true).catch(() => false);
        check(r, said, "Tuck says the check-in line");
      }
      page.once("dialog", (d) => d.accept());
      await page.click('[data-testid="focus-cancel"]'); await page.waitForTimeout(500);

      // ---- Ask Tuck: a chip sends on one tap and stays; the answer renders, Tuck's bubble gets the short line ----
      await page.click('[data-testid="ask-open"]');
      await page.click('[data-testid="ask-chips"] button >> nth=0');
      const ans = await page.waitForSelector('[data-testid="ask-answer"] li', { timeout: 8000 }).then(() => true).catch(() => false);
      check(r, ans && (await page.$$('[data-testid="ask-answer"] li')).length === 3, "study answer renders as a list");
      // a timer celebration may still be speaking; the reply's line follows once it ends
      const bubble = await page.waitForFunction(() => window.__pocketPal.store.getState().speech === "okay, three steps.", null, { timeout: 15000 }).then(() => "okay, three steps.").catch(() => page.evaluate(() => window.__pocketPal.store.getState().speech));
      check(r, bubble === "okay, three steps.", `speech bubble shows the short line (${bubble})`);
      await shot("ask");
      await page.keyboard.press("Escape");
      check(r, (await page.$$('[data-testid="ask-chips"] button')).length === 3, "chips stay visible after use");
      check(r, convo === 3, `three conversation requests: start, check-in, chip (${convo})`);
      await page.evaluate(() => window.__pocketPal.clock.reset());
      const errs = errors.filter((e) => !/GPU stall|WebGL.*(warning|performance)/i.test(e));
      check(r, !errs.length, `console errors: ${errs.join(" | ") || "none"}`);
    } catch (e) { check(r, false, "exception " + String(e).split("\n")[0]); await page.screenshot({ path: `screenshots/_fail-${r.run}.png` }).catch(() => {}); }
    await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
process.exit(failed ? 1 : 0);
