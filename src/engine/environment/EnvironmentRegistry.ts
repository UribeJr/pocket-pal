import type { BehaviorCommand, Vec3Like } from "@/types/companion";

/**
 * Things on the shelf Tuck can walk to and interact with. Positions match Diorama.tsx
 * (window/plant/clock/lamp) plus the focus hourglass. Tuck only moves along x, so each object
 * has a stand point, a body yaw to face on arrival and a head look target.
 */
export type EnvId = "clock" | "window" | "lamp" | "plant" | "shelf" | "hourglass";
export interface EnvInteraction { id: string; object: EnvId; build(): BehaviorCommand[] }
export interface EnvObject { id: EnvId; label: string; standX: number; yaw: number; look: Vec3Like; hit: { pos: [number, number, number]; size: [number, number, number] } }

export const ENV: Record<EnvId, EnvObject> = {
  clock:     { id: "clock", label: "clock", standX: 0.05, yaw: -0.9, look: { x: -0.35, y: 0.3, z: 0.1 }, hit: { pos: [-0.35, 0.28, 0.1], size: [0.5, 0.56, 0.4] } },
  window:    { id: "window", label: "window", standX: -1.35, yaw: -1.3, look: { x: -1.75, y: 1.2, z: -0.7 }, hit: { pos: [-1.75, 1.1, -0.68], size: [0.9, 1.3, 0.1] } },
  lamp:      { id: "lamp", label: "lamp", standX: 1.4, yaw: 1.2, look: { x: 1.75, y: 0.95, z: 0.15 }, hit: { pos: [1.75, 0.55, 0.15], size: [0.45, 1.1, 0.45] } },
  plant:     { id: "plant", label: "plant", standX: -0.88, yaw: -1.2, look: { x: -1.3, y: 0.45, z: 0.05 }, hit: { pos: [-1.3, 0.35, 0.05], size: [0.6, 0.7, 0.6] } },
  shelf:     { id: "shelf", label: "shelf", standX: 0.55, yaw: 0, look: { x: 0.5, y: 0, z: 1.2 }, hit: { pos: [0.2, -0.05, 0.62], size: [2.4, 0.12, 0.2] } },
  hourglass: { id: "hourglass", label: "hourglass", standX: 0.95, yaw: 1.3, look: { x: 1.25, y: 0.15, z: -0.25 }, hit: { pos: [1.25, 0.16, -0.25], size: [0.26, 0.36, 0.26] } },
};
export const HOURGLASS_POS = { x: 1.25, y: 0, z: -0.25 };

const approach = (o: EnvObject): BehaviorCommand[] => [
  { kind: "lookAt", target: o.look },
  { kind: "moveTo", x: o.standX },
  { kind: "face", yaw: o.yaw },
  { kind: "wait", seconds: 0.35 },
];

export const INTERACTIONS: EnvInteraction[] = [
  { id: "inspectClock", object: "clock", build: () => [...approach(ENV.clock), { kind: "play", clip: "inspect", fallback: ["lookAround"] }, { kind: "wait", seconds: 0.6 }] },
  { id: "gazeWindow", object: "window", build: () => [...approach(ENV.window), { kind: "emote", emotion: "content", hold: 6 }, { kind: "play", clip: "idle", hold: 3.5 }, { kind: "play", clip: "weightShift", fallback: ["idle"] }] },
  { id: "relaxLamp", object: "lamp", build: () => [...approach(ENV.lamp), { kind: "play", clip: "sitDown", fallback: ["idle"] }, { kind: "play", clip: "sitIdle", hold: 4.5 }, { kind: "play", clip: "standUp", fallback: ["idle"] }] },
  { id: "inspectPlant", object: "plant", build: () => [...approach(ENV.plant), { kind: "play", clip: "inspect", fallback: ["lookAround"] }, { kind: "emote", emotion: "curious", hold: 3 }, { kind: "play", clip: "happy", fallback: ["hop"] }] },
  { id: "sitShelfEdge", object: "shelf", build: () => [...approach(ENV.shelf), { kind: "play", clip: "sitDown", fallback: ["idle"] }, { kind: "play", clip: "sitIdle", hold: 5 }, { kind: "play", clip: "standUp", fallback: ["idle"] }] },
  { id: "pinNote", object: "shelf", build: () => [{ kind: "moveTo", x: 0.35 }, { kind: "face", yaw: 0.0 }, { kind: "lookAt", target: { x: 0.35, y: 1.3, z: -0.7 } }, { kind: "play", clip: "pinNote", fallback: ["stretch", "lookAround"] }] },
  { id: "checkHourglass", object: "hourglass", build: () => [...approach(ENV.hourglass), { kind: "play", clip: "inspect", fallback: ["lookAround"] }] },
];
export const interaction = (id: string) => INTERACTIONS.find((i) => i.id === id);
export const interactionsFor = (o: EnvId) => INTERACTIONS.filter((i) => i.object === o);

/** walk to the hourglass, flip it (prop animates on the "hourglass:flip" signal) */
export const flipHourglassCommands = (): BehaviorCommand[] => [
  ...approach(ENV.hourglass),
  { kind: "play", clip: "flip", fallback: ["inspect", "lookAround"] },
  { kind: "signal", name: "hourglass:flip" },
  { kind: "wait", seconds: 0.4 },
];
