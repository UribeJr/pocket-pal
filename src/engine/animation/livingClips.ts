import type { Pose, ProceduralClip } from "@/types/animation";
import { registerClip } from "./registry";

/** Living Phase 2–3 clips: small, readable gestures for the stand-in rig. */
const s = Math.sin;
const PI = Math.PI;
const bell = (k: number) => s(Math.min(1, Math.max(0, k)) * PI);
const ease = (k: number) => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x); };

/** seated rest pose, weight w in 0..1 */
const seated = (w: number): Pose => ({
  root: { p: [0, -0.1 * w, 0], s: [0.05 * w, -0.06 * w, 0.05 * w] },
  body: { r: [-0.08 * w, 0, 0] },
  footL: { p: [0, 0.03 * w, 0.1 * w], r: [-0.5 * w, 0, 0] },
  footR: { p: [0, 0.03 * w, 0.1 * w], r: [-0.5 * w, 0, 0] },
  armL: { r: [0.35 * w, 0, -0.15 * w] }, armR: { r: [0.35 * w, 0, 0.15 * w] },
});
const merge = (a: Pose, b: Pose): Pose => {
  const out: Pose = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof Pose, NonNullable<Pose[keyof Pose]>][]) {
    const o = out[k] ?? {};
    const add = (x?: [number, number, number], y?: [number, number, number]) => (x || y ? [(x?.[0] ?? 0) + (y?.[0] ?? 0), (x?.[1] ?? 0) + (y?.[1] ?? 0), (x?.[2] ?? 0) + (y?.[2] ?? 0)] as [number, number, number] : undefined);
    out[k] = { p: add(o.p, v.p), r: add(o.r, v.r), s: add(o.s, v.s) };
  }
  return out;
};

const stretch: ProceduralClip = {
  name: "stretch", layer: "base", loop: false, duration: 2.6,
  sample: (t) => {
    const e = bell(t / 2.6), sway = s(t * 2.4) * 0.06 * e;
    return {
      root: { p: [0, 0.04 * e, 0], s: [-0.04 * e, 0.08 * e, -0.04 * e] },
      body: { r: [-0.12 * e, 0, sway] }, head: { r: [-0.25 * e, 0, sway] },
      armL: { r: [0, 0, 2.3 * e] }, armR: { r: [0, 0, -2.3 * e] }, leaf: { r: [0, 0, 0.4 * e] },
    };
  },
};

const weightShift: ProceduralClip = {
  name: "weightShift", layer: "base", loop: false, duration: 2.2,
  sample: (t) => {
    const k = t / 2.2, w = s(k * 2 * PI) * bell(k);
    return { root: { p: [w * 0.025, 0, 0] }, body: { r: [0, 0, -w * 0.09] }, head: { r: [0, 0, w * 0.06] }, footL: { p: [0, Math.max(0, -w) * 0.02, 0] }, footR: { p: [0, Math.max(0, w) * 0.02, 0] } };
  },
};

const sitDown: ProceduralClip = { name: "sitDown", layer: "base", loop: false, duration: 1.1, sample: (t) => seated(ease(t / 1.1)) };
const standUp: ProceduralClip = { name: "standUp", layer: "base", loop: false, duration: 0.9, sample: (t) => seated(1 - ease(t / 0.9)) };
const sitIdle: ProceduralClip = {
  name: "sitIdle", layer: "base", loop: true, duration: 6,
  sample: (t) => merge(seated(1), { head: { r: [0.06 + s(t * 0.5) * 0.03, s(t * 0.3) * 0.08, 0] }, leaf: { r: [0, 0, s(t * 1.3) * 0.1] } }),
};
/** quiet focus activity: tiny knitting needles motion in the lap */
const sitKnit: ProceduralClip = {
  name: "sitKnit", layer: "base", loop: true, duration: 1.6,
  sample: (t) => merge(seated(1), {
    head: { r: [0.22, 0, s(t * 0.4) * 0.03] },
    armL: { r: [0.25 + s(t * 7.8) * 0.12, 0, 0.1] }, armR: { r: [0.25 - s(t * 7.8) * 0.12, 0, -0.1] },
  }),
};
const yawn: ProceduralClip = {
  name: "yawn", layer: "base", loop: false, duration: 2.4,
  sample: (t) => {
    const e = bell(t / 2.4);
    return { head: { r: [-0.35 * e, 0, 0.05 * e] }, body: { r: [-0.08 * e, 0, 0], s: [0, 0.05 * e, 0] }, armL: { r: [0, 0, 1.1 * e] }, eyes: { s: [0, -0.85 * e, 0] } };
  },
};
const wakeUp: ProceduralClip = {
  name: "wakeUp", layer: "base", loop: false, duration: 1.6,
  sample: (t) => {
    const k = t / 1.6, droop = 1 - ease(k * 1.6), shake = k > 0.55 ? s(t * 28) * 0.08 * bell((k - 0.55) / 0.45) : 0;
    return { head: { r: [0.18 * droop, shake * 2, 0.12 * droop] }, body: { r: [0, shake, 0] }, leaf: { r: [0, 0, shake * 4] } };
  },
};
const inspect: ProceduralClip = {
  name: "inspect", layer: "base", loop: false, duration: 2.8,
  sample: (t) => {
    const k = t / 2.8, e = bell(k);
    return { body: { r: [0.22 * e, 0, 0] }, head: { r: [0.15 * e, 0, s(k * 3 * PI) * 0.18 * e] }, armR: { r: [-0.9 * e, 0, -0.3 * e] }, root: { p: [0, 0, 0.03 * e] } };
  },
};
const startle: ProceduralClip = {
  name: "startle", layer: "base", loop: false, duration: 1.0,
  sample: (t) => {
    const k = t / 1.0, jump = k < 0.35 ? bell(k / 0.35) : 0, e = 1 - ease((k - 0.2) / 0.8);
    return { root: { p: [0, jump * 0.12, -0.03 * e] }, armL: { r: [0, 0, 1.4 * e] }, armR: { r: [0, 0, -1.4 * e] }, head: { r: [-0.2 * e, 0, 0] }, eyes: { s: [0.25 * e, 0.3 * e, 0] }, leaf: { r: [0, 0, 0.8 * e] } };
  },
};
/** reach forward and tip something over (the hourglass) */
const flip: ProceduralClip = {
  name: "flip", layer: "base", loop: false, duration: 1.5,
  sample: (t) => {
    const k = t / 1.5, reach = bell(k), turn = ease((k - 0.3) / 0.4);
    return { body: { r: [0.2 * reach, 0, 0] }, armL: { r: [-1.2 * reach, 0, 0.3 * reach - turn * 0.4 * reach] }, armR: { r: [-1.2 * reach, 0, -0.3 * reach + turn * 0.4 * reach] }, head: { r: [0.18 * reach, 0, 0] } };
  },
};
/** reach up on tiptoes and press a note to the wall */
const pinNote: ProceduralClip = {
  name: "pinNote", layer: "base", loop: false, duration: 1.8,
  sample: (t) => {
    const k = t / 1.8, e = bell(k), tap = k > 0.45 && k < 0.65 ? s(((k - 0.45) / 0.2) * 2 * PI) * 0.15 : 0;
    return { root: { p: [0, 0.05 * e, 0] }, footL: { r: [0.3 * e, 0, 0] }, footR: { r: [0.3 * e, 0, 0] }, armR: { r: [-0.6 * e, 0, -2.0 * e + tap] }, head: { r: [-0.3 * e, 0, 0] } };
  },
};

export const LIVING_CLIPS = [stretch, weightShift, sitDown, sitIdle, sitKnit, standUp, yawn, wakeUp, inspect, startle, flip, pinNote];
LIVING_CLIPS.forEach(registerClip);
export const livingClipsRegistered = true;
