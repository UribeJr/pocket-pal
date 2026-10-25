"use client";
import { useEffect } from "react";
import { PRIORITY } from "@/types/companion";
import { getActiveController } from "@/engine/activeController";
import { nowWithOverride } from "@/engine/simulation/timeOfDay";
import { useCompanionStore } from "@/stores/companionStore";
import { browserKV, requestPersist } from "./persist";
import { catchUp, loadSession, saveSession } from "./session";
import { memory } from "./conversation";
import { fetchReaction, perform } from "./reactions";
import { localReaction } from "@/ai/react";

/** living P5-lite: restore mood after elapsed-time catch-up, local "you're back" line, keep lastActiveAt fresh. */
export function useSessionPersistence() {
  useEffect(() => {
    const kv = browserKV(); if (!kv) return;
    requestPersist(); memory();
    const now = Date.now(); const h = nowWithOverride().getHours();
    const sess = loadSession(kv, now);
    const { mood, greeting } = catchUp(sess, now, h < 6 || h >= 22);
    saveSession(kv, { ...sess, lastActiveAt: now });
    let tries = 0;
    const wait = setInterval(() => {
      const ctl = getActiveController();
      if (!ctl && ++tries < 50) return;
      clearInterval(wait);
      if (!ctl) return;
      const cmds = [];
      if (mood !== "content") cmds.push({ kind: "emote" as const, emotion: mood, hold: 6 });
      if (cmds.length) void ctl.run(cmds, PRIORITY.activity, "welcome-back");
      if (greeting) {
        // a "return after 30+ min" moment: one AI reaction, else the local greeting
        const minutes = Math.min(100000, Math.round((now - sess.lastActiveAt) / 60000));
        void fetchReaction("return", { minutes }).then((res) => perform(res?.ok ? res.reaction : { ...localReaction("return"), line: greeting }, "welcome-back"));
      }
    }, 200);
    const flush = () => { const s = loadSession(kv, Date.now()); saveSession(kv, { ...s, lastActiveAt: Date.now(), mood: useCompanionStore.getState().emotion }); };
    const iv = setInterval(flush, 20_000);
    const vis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("pagehide", flush);
    return () => { clearInterval(wait); clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", flush); };
  }, []);
}
