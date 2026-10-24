import type { ProceduralClip } from "@/types/animation";
import { registerClip } from "./registry";

const TAU = Math.PI * 2;
const s = Math.sin;

const idle: ProceduralClip = {
  name: "idle", layer: "base", loop: true, duration: 4,
  sample: (t) => ({
    body: { r: [0, 0, s(t * 0.9) * 0.03] },
    head: { r: [s(t * 0.7) * 0.03, 0, s(t * 0.9 + 1) * 0.04] },
    armL: { r: [0, 0, s(t * 1.1) * 0.06] },
    armR: { r: [0, 0, -s(t * 1.1) * 0.06] },
    leaf: { r: [0, 0, s(t * 1.7) * 0.15] },
  }),
};

const lookAround: ProceduralClip = {
  name: "lookAround", layer: "base", loop: false, duration: 3.2,
  sample: (t) => {
    const k = t / 3.2;
    const yaw = s(k * TAU) * 0.6 * s(k * Math.PI);
    return { head: { r: [-0.05 * s(k * Math.PI), yaw, 0] }, body: { r: [0, yaw * 0.25, 0] } };
  },
};

const walk: ProceduralClip = {
  name: "walk", layer: "base", loop: true, duration: 0.7,
  sample: (t) => {
    const ph = (t / 0.7) * TAU;
    return {
      root: { p: [0, Math.abs(s(ph)) * 0.05, 0] },
      body: { r: [0.06, 0, s(ph) * 0.08] },
      footL: { p: [0, Math.max(0, s(ph)) * 0.05, s(ph) * 0.06] },
      footR: { p: [0, Math.max(0, -s(ph)) * 0.05, -s(ph) * 0.06] },
      armL: { r: [s(ph) * 0.5, 0, 0] },
      armR: { r: [-s(ph) * 0.5, 0, 0] },
      leaf: { r: [0, 0, s(ph * 2) * 0.25] },
    };
  },
};

const hop: ProceduralClip = {
  name: "hop", layer: "base", loop: false, duration: 0.9,
  sample: (t) => {
    const k = t / 0.9;
    // anticipation squash -> jump -> land squash
    const squash = k < 0.18 ? s((k / 0.18) * Math.PI) * 0.18 : k > 0.78 ? s(((k - 0.78) / 0.22) * Math.PI) * 0.14 : 0;
    const air = k >= 0.18 && k <= 0.78 ? s(((k - 0.18) / 0.6) * Math.PI) : 0;
    return {
      root: { p: [0, air * 0.32, 0], s: [squash * 0.6, -squash, squash * 0.6] },
      armL: { r: [0, 0, air * 1.2] },
      armR: { r: [0, 0, -air * 1.2] },
      cap: { p: [0, air * 0.04, 0], r: [air * -0.12, 0, 0] },
      leaf: { r: [0, 0, air * 0.6] },
      footL: { p: [0, 0, 0] },
    };
  },
};

const happy: ProceduralClip = {
  name: "happy", layer: "base", loop: false, duration: 1.4,
  sample: (t) => {
    const k = t / 1.4;
    const env = s(k * Math.PI);
    return {
      body: { r: [0, 0, s(t * 12) * 0.12 * env] },
      head: { r: [-0.15 * env, 0, s(t * 12 + 0.5) * 0.1 * env] },
      armL: { r: [0, 0, (0.9 + s(t * 14) * 0.3) * env] },
      armR: { r: [0, 0, -(0.9 + s(t * 14) * 0.3) * env] },
    };
  },
};

const talk: ProceduralClip = {
  name: "talk", layer: "base", loop: true, duration: 2,
  sample: (t) => ({
    head: { r: [s(t * 5) * 0.05, s(t * 1.3) * 0.1, s(t * 2) * 0.04] },
    armR: { r: [s(t * 3) * 0.3, 0, -0.4 - s(t * 3) * 0.2] },
    body: { r: [0, 0, s(t * 2) * 0.03] },
  }),
};

const sleep: ProceduralClip = {
  name: "sleep", layer: "base", loop: true, duration: 5,
  sample: (t) => ({
    head: { r: [0.18, 0, 0.12 + s(t * 0.8) * 0.02] },
    body: { s: [s(t * 1.2) * 0.02, -s(t * 1.2) * 0.02, s(t * 1.2) * 0.02] },
    armL: { r: [0, 0, -0.1] }, armR: { r: [0, 0, 0.1] },
  }),
};

// --- additive layers ---
const breathe: ProceduralClip = {
  name: "breathe", layer: "additive", loop: true, duration: 3.5,
  sample: (t) => {
    const b = s((t / 3.5) * TAU);
    return { body: { s: [b * 0.025, b * 0.035, b * 0.025] }, head: { p: [0, b * 0.008, 0] } };
  },
};

const blink: ProceduralClip = {
  name: "blink", layer: "additive", loop: true, duration: 4.3,
  sample: (t) => {
    // quick blink near the start of each cycle, double blink every other cycle
    const c = t % 4.3;
    const one = (x: number) => (x > 0 && x < 0.16 ? s((x / 0.16) * Math.PI) : 0);
    const closed = Math.max(one(c - 0.1), Math.floor(t / 4.3) % 2 ? one(c - 0.35) : 0);
    return { eyes: { s: [0, -closed * 0.92, 0] } };
  },
};

[idle, lookAround, walk, hop, happy, talk, sleep, breathe, blink].forEach(registerClip);
export const coreClipsRegistered = true;
