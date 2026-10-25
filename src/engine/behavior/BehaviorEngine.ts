import type { BehaviorCommand, Emotion, LayoutMode, Priority } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import { tuckPersonality } from "@/companion/personality";

/** What the engine needs from the controller (CharacterControllerImpl satisfies it; tests use a fake). */
export interface EngineController {
  readonly activePriority: Priority;
  readonly emotions: { emotion: Emotion };
  run(cmds: BehaviorCommand[], p: Priority, label?: string): Promise<unknown>;
  setEmotion(e: Emotion, p?: Priority, hold?: number): boolean;
  returnToIdle(): void;
}
/** the study session as Tuck's routine sees it (derived from the Pomodoro) */
export type StudyPhase = "ready" | "focus" | "paused" | "break";
export interface EngineContext {
  hour: number; daylight: number; layout: LayoutMode; focus: StudyPhase; posX: number; busy?: boolean;
  /** seconds since the user last did anything (tap, timer, chat) */
  idleFor?: number;
  /** where the timer is, for glances (world units) */
  clockAt?: { x: number; y: number; z: number };
}

export interface Activity {
  id: string;
  /** base weight before modifiers */
  base: number;
  cooldown: number;
  /** energy spent (negative = restores) */
  cost: number;
  /** which study phases it may run in (default: ready / break) */
  phases?: StudyPhase[];
  build(ctx: EngineContext): BehaviorCommand[];
}

const W = tuckPersonality.activityWeights;
const free: StudyPhase[] = ["ready", "break"];
const USER = { x: 0, y: 1.2, z: 6 };
const CLOCK_FALLBACK = { x: -1.6, y: 0.7, z: 0.8 };
/** seconds of no interaction (outside a focus session) after which Tuck may doze off */
export const DOZE_AFTER_S = 240;

/**
 * Phase 6 study routine: Tuck stays on his spot (no room to walk to). Ready = calm idles; focus = seated
 * quiet with rare glances at the timer or the user; break = playful (stretch, hop, happy).
 */
export function defaultActivities(rand: () => number): Activity[] {
  return [
    // "just exist": the dominant option, does nothing visible for a while
    { id: "quiet", base: W.quiet, cooldown: 0, cost: -0.04, phases: ["ready", "break", "focus", "paused"], build: () => [{ kind: "wait", seconds: 4 + rand() * 5 }] },
    { id: "lookAround", base: W.lookAround, cooldown: 12, cost: 0.01, build: () => [{ kind: "play", clip: "lookAround" }] },
    { id: "stretch", base: W.stretch, cooldown: 40, cost: -0.02, build: () => [{ kind: "play", clip: "stretch", fallback: ["happy"] }] },
    { id: "weightShift", base: W.weightShift, cooldown: 10, cost: 0, build: () => [{ kind: "play", clip: "weightShift", fallback: ["idle"] }] },
    { id: "yawn", base: 0.5, cooldown: 60, cost: 0, phases: ["ready"], build: () => [{ kind: "play", clip: "yawn", fallback: ["lookAround"] }] },
    // breaks are for moving around a little
    { id: "hop", base: 0.9, cooldown: 25, cost: 0.03, phases: ["break"], build: () => [{ kind: "emote", emotion: "playful", hold: 4 }, { kind: "play", clip: "hop", fallback: ["happy"] }] },
    { id: "happy", base: 0.7, cooldown: 30, cost: 0.02, phases: ["break"], build: () => [{ kind: "play", clip: "happy", fallback: ["hop"] }] },
    // focus: stay seated, glance at the timer or the user now and then
    { id: "glanceClock", base: 1.2, cooldown: 45, cost: 0, phases: ["focus", "paused"], build: (ctx) => [{ kind: "lookAt", target: ctx.clockAt ?? CLOCK_FALLBACK }, { kind: "play", clip: "sitIdle", hold: 2.5 }] },
    { id: "glanceUser", base: 0.6, cooldown: 90, cost: 0, phases: ["focus", "paused"], build: () => [{ kind: "lookAt", target: USER }, { kind: "play", clip: "sitIdle", hold: 1.8 }] },
  ];
}

/**
 * BehaviorEngine (grown from IdleBehavior). Every few seconds (much less often during focus), if nothing
 * more important is running, it picks a weighted activity (study phase, time of day, mood, energy, recency,
 * cooldowns) and issues it through controller.run at PRIORITY.activity, so any user/system job pre-empts it.
 */
export class BehaviorEngine {
  energy: number;
  next = 4;
  readonly history: string[] = [];
  private lastRun = new Map<string, number>();
  private t = 0;
  readonly activities: Activity[];
  constructor(private ctl: EngineController, private rand: () => number = Math.random, energy = 0.8) {
    this.energy = energy;
    this.activities = defaultActivities(rand);
  }

  weightOf(a: Activity, ctx: EngineContext): number {
    if (!(a.phases ?? free).includes(ctx.focus)) return 0;
    const last = this.lastRun.get(a.id);
    if (last !== undefined && this.t - last < a.cooldown) return 0;
    let w = a.base;
    const e = this.energy, emo = this.ctl.emotions.emotion;
    const night = ctx.daylight < 0.25;
    if (a.cost > 0) w *= 0.3 + e; // tired Tuck moves less
    if (a.id === "yawn") w *= (1.6 - e) * (night ? 2 : 1);
    if (a.id === "stretch" && ctx.focus === "break") w *= 4;
    if (a.id === "quiet" && (ctx.focus === "focus" || ctx.focus === "paused")) w *= 2;
    if (a.id === "quiet" && ctx.focus === "break") w *= 0.5; // breaks are livelier
    if (emo === "playful" || emo === "excited") { if (a.id === "lookAround" || a.id === "hop" || a.id === "happy") w *= 1.5; }
    if (this.history[this.history.length - 1] === a.id && a.id !== "quiet") w *= 0.2; // recency
    return Math.max(0, w);
  }

  pick(ctx: EngineContext): Activity | null {
    const ws = this.activities.map((a) => this.weightOf(a, ctx));
    const total = ws.reduce((s, w) => s + w, 0);
    if (total <= 0) return null;
    let r = this.rand() * total;
    for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0 && ws[i] > 0) return this.activities[i]; }
    return this.activities[ws.findLastIndex((w) => w > 0)];
  }

  /** choose and start one activity now (also used by tests/dev hook) */
  decide(ctx: EngineContext, force?: string): string | null {
    const a = force ? this.activities.find((x) => x.id === force) ?? null : this.pick(ctx);
    if (!a) return null;
    this.lastRun.set(a.id, this.t);
    this.history.push(a.id); if (this.history.length > 50) this.history.shift();
    this.energy = Math.min(1, Math.max(0, this.energy - a.cost));
    void this.ctl.run(a.build(ctx), PRIORITY.activity, a.id);
    return a.id;
  }

  /** seconds until the next decision: long and calm during focus, lively in breaks */
  private gap(ctx: EngineContext) {
    if (ctx.focus === "focus") return 20 + this.rand() * 20;
    if (ctx.focus === "paused") return 10 + this.rand() * 8;
    if (ctx.focus === "break") return 3 + this.rand() * 4;
    return 4 + this.rand() * 5;
  }

  tick(dt: number, ctx: EngineContext) {
    this.t += dt;
    const sleepy = this.ctl.emotions.emotion === "sleepy";
    // energy: slow recovery while resting, faster asleep; daylight sets a soft ceiling at night
    const cap = ctx.daylight < 0.25 ? 0.6 : 1;
    this.energy = Math.min(cap, Math.max(0, this.energy + dt * (sleepy ? 0.01 : 0.0015)));
    if (this.ctl.activePriority > PRIORITY.ambient || ctx.busy) { this.next = Math.max(this.next, 3); return; }
    this.next -= dt;
    if (this.next > 0) return;
    this.next = this.gap(ctx);
    const r = this.rand();
    // dozing belongs to the ready state only: never during a focus session, a pause or a break
    if (ctx.focus === "ready") {
      const lonely = (ctx.idleFor ?? 0) > DOZE_AFTER_S;
      if (!sleepy && ((ctx.daylight < 0.2 && r < 0.25 * (1.4 - this.energy)) || (lonely && r < 0.35))) {
        void this.ctl.run([{ kind: "play", clip: "yawn", fallback: ["idle"] }], PRIORITY.activity, "yawn").then((res) => {
          if (res !== "done") return; // an interrupted yawn (a tap, the timer) must not put him to sleep
          this.ctl.setEmotion("sleepy", PRIORITY.activity, Infinity); this.ctl.returnToIdle();
        });
        this.history.push("fallAsleep");
        return;
      }
      if (sleepy) {
        if (r < 0.15 && !lonely && (ctx.daylight >= 0.2 || this.energy > 0.55)) { this.ctl.setEmotion("content", PRIORITY.activity); void this.ctl.run([{ kind: "play", clip: "wakeUp", fallback: ["lookAround"] }], PRIORITY.activity, "wakeUp"); this.history.push("wakeUp"); }
        return;
      }
    } else if (sleepy) {
      // the timer is running: a sleepy Tuck wakes up to keep the user company
      this.ctl.setEmotion("content", PRIORITY.activity);
      void this.ctl.run([{ kind: "play", clip: "wakeUp", fallback: ["lookAround"] }], PRIORITY.activity, "wakeUp");
      this.history.push("wakeUp");
      return;
    }
    this.decide(ctx);
  }
}
