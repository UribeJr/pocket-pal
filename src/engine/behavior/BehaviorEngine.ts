import type { BehaviorCommand, Emotion, LayoutMode, Priority } from "@/types/companion";
import { PRIORITY } from "@/types/companion";
import { tuckPersonality } from "@/companion/personality";
import { interaction, ENV } from "@/engine/environment/EnvironmentRegistry";
import type { FocusPhase } from "@/companion/focus";

/** What the engine needs from the controller (CharacterControllerImpl satisfies it; tests use a fake). */
export interface EngineController {
  readonly activePriority: Priority;
  readonly emotions: { emotion: Emotion };
  run(cmds: BehaviorCommand[], p: Priority, label?: string): Promise<unknown>;
  setEmotion(e: Emotion, p?: Priority, hold?: number): boolean;
  returnToIdle(): void;
}
export interface EngineContext { hour: number; daylight: number; layout: LayoutMode; focus: FocusPhase; posX: number; busy?: boolean }

export interface Activity {
  id: string;
  /** base weight before modifiers */
  base: number;
  cooldown: number;
  /** energy spent (negative = restores) */
  cost: number;
  walks?: boolean;
  /** which focus phases it may run in (default: idle/done/break) */
  phases?: FocusPhase[];
  build(ctx: EngineContext): BehaviorCommand[];
}

const W = tuckPersonality.activityWeights;
const free: FocusPhase[] = ["idle", "break", "done"];
const randX = (r: () => number) => -1.2 + r() * 2.6;

export function defaultActivities(rand: () => number): Activity[] {
  return [
    // "just exist": the dominant option, does nothing visible for a while
    { id: "quiet", base: W.quiet, cooldown: 0, cost: -0.04, phases: ["idle", "break", "done", "focus"], build: () => [{ kind: "wait", seconds: 4 + rand() * 5 }] },
    { id: "lookAround", base: W.lookAround, cooldown: 12, cost: 0.01, build: () => [{ kind: "play", clip: "lookAround" }] },
    { id: "wander", base: W.wander, cooldown: 15, cost: 0.06, walks: true, build: () => [{ kind: "moveTo", x: randX(rand) }, { kind: "face", yaw: (rand() - 0.5) * 0.6 }, { kind: "wait", seconds: 1 }] },
    { id: "stretch", base: W.stretch, cooldown: 40, cost: -0.02, build: () => [{ kind: "play", clip: "stretch", fallback: ["happy"] }] },
    { id: "weightShift", base: W.weightShift, cooldown: 10, cost: 0, build: () => [{ kind: "play", clip: "weightShift", fallback: ["idle"] }] },
    { id: "yawn", base: 0.5, cooldown: 60, cost: 0, build: () => [{ kind: "play", clip: "yawn", fallback: ["lookAround"] }] },
    { id: "inspectClock", base: W.inspectClock, cooldown: 90, cost: 0.05, walks: true, build: () => interaction("inspectClock")!.build() },
    { id: "gazeWindow", base: W.gazeWindow, cooldown: 90, cost: 0.04, walks: true, build: () => interaction("gazeWindow")!.build() },
    { id: "relaxLamp", base: W.relaxLamp, cooldown: 120, cost: -0.1, walks: true, build: () => interaction("relaxLamp")!.build() },
    { id: "inspectPlant", base: W.inspectPlant, cooldown: 90, cost: 0.05, walks: true, build: () => interaction("inspectPlant")!.build() },
    { id: "sitShelfEdge", base: 0.7, cooldown: 120, cost: -0.1, walks: true, build: () => interaction("sitShelfEdge")!.build() },
    { id: "pinNote", base: 0.35, cooldown: 300, cost: 0.04, walks: true, build: () => interaction("pinNote")!.build() },
    // focus-only: stay seated, glance at the hourglass now and then
    { id: "glanceHourglass", base: 1.2, cooldown: 45, cost: 0, phases: ["focus"], build: () => [{ kind: "lookAt", target: ENV.hourglass.look }, { kind: "play", clip: "sitIdle", hold: 2.5 }] },
    { id: "glanceUser", base: 0.6, cooldown: 90, cost: 0, phases: ["focus"], build: () => [{ kind: "lookAt", target: { x: 0, y: 1.2, z: 6 } }, { kind: "play", clip: "sitIdle", hold: 1.8 }] },
  ];
}

/**
 * Living Phase 2–3 BehaviorEngine (grown from IdleBehavior). Every few seconds, if nothing more important
 * is running, it picks a weighted activity (time of day, mood, energy, recency, cooldowns) and issues it
 * through controller.run at PRIORITY.activity, so any user/system job pre-empts it.
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
    if (ctx.layout === "pocket" && a.walks) return 0;
    const last = this.lastRun.get(a.id);
    if (last !== undefined && this.t - last < a.cooldown) return 0;
    let w = a.base;
    const e = this.energy, emo = this.ctl.emotions.emotion;
    const night = ctx.daylight < 0.25;
    if (a.cost > 0) w *= 0.3 + e; // tired Tuck moves less
    if (a.walks && night) w *= 0.5;
    if (a.id === "yawn") w *= (1.6 - e) * (night ? 2 : 1);
    if (a.id === "stretch" && ctx.focus === "break") w *= 4;
    if ((a.id === "relaxLamp" || a.id === "sitShelfEdge") && e < 0.4) w *= 2.5;
    if (a.id === "quiet" && ctx.focus === "focus") w *= 2;
    if (a.id === "gazeWindow" && ctx.hour >= 6 && ctx.hour < 10) w *= 1.6; // morning light
    if (a.id === "inspectClock" && (ctx.hour === 12 || ctx.hour === 17)) w *= 1.5;
    if (emo === "playful" || emo === "excited") { if (a.walks || a.id === "lookAround") w *= 1.5; }
    if (emo === "curious" && a.id.startsWith("inspect")) w *= 1.6;
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

  tick(dt: number, ctx: EngineContext) {
    this.t += dt;
    const sleepy = this.ctl.emotions.emotion === "sleepy";
    // energy: slow recovery while resting, faster asleep; daylight sets a soft ceiling at night
    const cap = ctx.daylight < 0.25 ? 0.6 : 1;
    this.energy = Math.min(cap, Math.max(0, this.energy + dt * (sleepy ? 0.01 : 0.0015)));
    if (this.ctl.activePriority > PRIORITY.ambient || ctx.busy) { this.next = Math.max(this.next, 3); return; }
    this.next -= dt;
    if (this.next > 0) return;
    this.next = 4 + this.rand() * 5;
    const r = this.rand();
    if (ctx.focus !== "focus") {
      if (ctx.daylight < 0.2 && !sleepy && r < 0.25 * (1.4 - this.energy)) {
        void this.ctl.run([{ kind: "play", clip: "yawn", fallback: ["idle"] }], PRIORITY.activity, "yawn").then(() => { this.ctl.setEmotion("sleepy", PRIORITY.activity, Infinity); this.ctl.returnToIdle(); });
        this.history.push("fallAsleep");
        return;
      }
      if (sleepy) {
        if (r < 0.15 && (ctx.daylight >= 0.2 || this.energy > 0.55)) { this.ctl.setEmotion("content", PRIORITY.activity); void this.ctl.run([{ kind: "play", clip: "wakeUp", fallback: ["lookAround"] }], PRIORITY.activity, "wakeUp"); this.history.push("wakeUp"); }
        return;
      }
    }
    this.decide(ctx);
  }
}
