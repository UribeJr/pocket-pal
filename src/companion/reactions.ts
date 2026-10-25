"use client";
import { actionCommands, type AiAction } from "@/ai/actions";
import { localReaction, reactFallback, type ReactEvent, type ReactRequest, type ReactResponse } from "@/ai/react";
import type { BehaviorCommand } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import { getActiveController } from "@/engine/activeController";
import { buildContext, deviceId, takeDeviceQuota } from "./conversation";
import { usePomodoro } from "./pomodoro";

/**
 * Event-driven AI reactions. The model is only asked at real moments (session start/end, return,
 * the occasional environment tap, a milestone) and each event has a cooldown. Everything else, and every
 * failure (offline, no key, rate limit), uses local reactions. There is no polling and no idle call.
 */
const COOLDOWN_S: Record<ReactEvent, number> = { session_start: 60, session_end: 60, break_end: 120, return: 1800, env_tap: 300, memory_moment: 6 * 3600 };
const GLOBAL_GAP_S = 20;
const ENV_TAP_CHANCE = 0.35;
const last = new Map<ReactEvent, number>();
let lastAny = 0;
export const reactionLog: { event: ReactEvent; source: "ai" | "local" | "skipped"; at: number }[] = [];

/** should this moment go to the model? (pure policy; exported for tests) */
export function shouldAsk(event: ReactEvent, now: number, rand = Math.random): boolean {
  if (now - lastAny < GLOBAL_GAP_S * 1000) return false;
  const l = last.get(event);
  if (l !== undefined && now - l < COOLDOWN_S[event] * 1000) return false;
  if (event === "env_tap" && rand() > ENV_TAP_CHANCE) return false;
  return true;
}
export function _resetReactionCooldowns() { last.clear(); lastAny = 0; reactionLog.length = 0; }

export async function fetchReaction(event: ReactEvent, detail: ReactRequest["detail"] = {}, fetcher: typeof fetch = fetch): Promise<ReactResponse | null> {
  const now = Date.now();
  if (!shouldAsk(event, now)) { reactionLog.push({ event, source: "skipped", at: now }); return null; }
  last.set(event, now); lastAny = now;
  let res: ReactResponse;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) res = reactFallback(event, "offline");
    else if (!takeDeviceQuota()) res = reactFallback(event, "rate_limited");
    else {
      const ctx = buildContext();
      const p = usePomodoro.getState();
      if (p.status !== "ready") ctx.activity = p.phase === "focus" ? "focusing" : "on_break";
      const r = await fetcher("/api/react", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, detail, context: ctx, deviceId: deviceId() }), signal: AbortSignal.timeout(8000) });
      const body = (await r.json().catch(() => null)) as ReactResponse | null;
      res = body?.reaction?.emotion ? body : reactFallback(event, "unavailable");
    }
  } catch { res = reactFallback(event, "unavailable"); }
  reactionLog.push({ event, source: res.source, at: now });
  return res;
}

export function reactionCommands(r: ReactResponse["reaction"], seated: boolean): BehaviorCommand[] {
  // seated in a focus session: even the "quiet" actions are standing clips that would pop him out of
  // his seat (a user-priority request stands him up), so he reacts from the chair instead
  const action: AiAction = seated ? "none" : r.action;
  const cmds: BehaviorCommand[] = [{ kind: "emote", emotion: r.emotion, hold: 6 }];
  if (r.line) cmds.push({ kind: "say", text: r.line, seconds: Math.min(5, 2 + r.line.length * 0.05) });
  cmds.push(...actionCommands(action, r.emotion));
  if (seated) cmds.push({ kind: "play", clip: "sitIdle", hold: r.line ? 1.5 : 1.2 });
  else if (cmds.length === 1 || (r.line && action === "none")) cmds.push({ kind: "wait", seconds: 1.2 });
  return cmds;
}

/** a focus session is running or paused: Tuck is seated and quiet, so only quiet actions are allowed */
export function isStudying() {
  const p = usePomodoro.getState();
  return p.phase === "focus" && p.status !== "ready";
}

/** wait until the controller is free of user/system jobs (max ~12 s), then perform at user priority */
export async function perform(r: ReactResponse["reaction"], label: string) {
  for (let i = 0; i < 48; i++) {
    const c = getActiveController();
    if (c && c.activePriority < PRIORITY.user) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  const ctl = getActiveController(); if (!ctl) return;
  const seated = isStudying();
  await ctl.run(reactionCommands(r, seated), PRIORITY.user, label);
}

/** ask (if allowed) and perform; when skipped by cooldown, performs `localIfSkipped` (or nothing) */
export async function triggerReaction(event: ReactEvent, detail: ReactRequest["detail"] = {}, opts: { localIfSkipped?: boolean } = {}) {
  const res = await fetchReaction(event, detail);
  const r = res?.reaction ?? (opts.localIfSkipped ? localReaction(event) : null);
  if (r) await perform(r, `react:${event}`);
  return res;
}
