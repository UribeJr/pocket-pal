import * as THREE from "three";

/** `tuck_face` extras on the GLB's RIG_Tuck node (tuck-character-studio scripts/face_tuck.py). */
export interface FaceMeta {
  version: number;
  presets: Record<string, Record<string, number>>;
  blink: string;
  blink_suppressed_by: string[];
  blink_overrides: string[];
  visemes: { open: string; round: string; wide: string };
  talk_expression_mouth_scale: number;
  meshes: string[];
}

type Viseme = keyof FaceMeta["visemes"];
const MOUTH_EXPR = ["Mouth_SmileBig", "Mouth_Small", "Mouth_O", "Mouth_OBig"];

/** Text-driven viseme: a/i -> open, o/u/w -> round, e/y -> wide, m/b/p and punctuation -> closed. */
export function visemeAt(text: string, t: number, seconds: number): [Viseme | null, number] {
  const step = Math.max(0.05, Math.min(0.09, seconds / Math.max(1, text.length)));
  const ch = text[Math.floor(t / step)]?.toLowerCase() ?? "";
  if (/[aiä]/.test(ch)) return ["open", 1];
  if (/[ouw]/.test(ch)) return ["round", 1];
  if (/[ey]/.test(ch)) return ["wide", 1];
  if (/[mbp.,!?;:]/.test(ch) || !ch) return [null, 0];
  return ch === " " ? ["open", 0.1] : ["open", 0.35];
}

/**
 * GLB face: expression preset + blink + talk visemes on the 12 morph targets. It only writes
 * morphTargetInfluences and runs after the mixer (the clips carry no morph tracks), so body
 * animation can never overwrite it. Port of tuck-character-studio viewer/src/face/FaceDriver.ts.
 */
export class FaceDriver {
  face = "neutral";
  blinkRate = 1;
  readonly weights: Record<string, number> = {};
  private readonly slots: { mesh: THREE.Mesh; index: Record<string, number> }[] = [];
  private untilBlink = 2;
  private blinkT = -1;
  private talk: { text: string; t: number; seconds: number } | null = null;

  constructor(root: THREE.Object3D, readonly meta: FaceMeta, private readonly random: () => number = Math.random) {
    // a face node is a Mesh (or a Group of Meshes for several materials); EyeShine is a child of Eye
    const seen = new Set<THREE.Mesh>();
    for (const name of meta.meshes) {
      const node = root.getObjectByName(name);
      const meshes = (node as THREE.Mesh | undefined)?.isMesh ? [node as THREE.Mesh] : ((node?.children ?? []).filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[]);
      for (const mesh of meshes)
        if (mesh.morphTargetDictionary && !seen.has(mesh)) { seen.add(mesh); this.slots.push({ mesh, index: mesh.morphTargetDictionary }); }
    }
  }

  get meshCount() { return this.slots.length; }
  get speaking() { return this.talk !== null; }

  setFace(face: string) { if (this.meta.presets[face]) this.face = face; }
  blink() { this.blinkT = 0; }
  /** seconds defaults to ~70 ms per character */
  speak(text: string, seconds = Math.max(1, text.length * 0.07)) { this.talk = text ? { text, t: 0, seconds } : null; }
  stopSpeaking() { this.talk = null; }

  /** compose(): the target weights for this instant, before smoothing */
  private target(dt: number): Record<string, number> {
    const m = this.meta;
    const w: Record<string, number> = { ...m.presets[this.face] };
    this.untilBlink -= dt * this.blinkRate;
    if (this.untilBlink <= 0) {
      this.blinkT = 0;
      this.untilBlink = this.random() < 0.15 ? 0.32 : 3 + this.random() * 2.6; // occasional double blink
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = this.blinkT < 0.06 ? this.blinkT / 0.06 : Math.max(0, 1 - (this.blinkT - 0.06) / 0.1);
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    const closed = Math.max(0, ...m.blink_suppressed_by.map((k) => w[k] ?? 0));
    const b = blink * (1 - closed);
    if (b > 0) {
      w[m.blink] = b;
      for (const k of m.blink_overrides) if (w[k]) w[k] *= 1 - b;
    }
    if (this.talk) {
      this.talk.t += dt;
      if (this.talk.t > this.talk.seconds) this.talk = null;
      else {
        for (const k of MOUTH_EXPR) if (w[k]) w[k] *= m.talk_expression_mouth_scale;
        const [vis, vw] = visemeAt(this.talk.text, this.talk.t, this.talk.seconds);
        if (vis) w[m.visemes[vis]] = (w[m.visemes[vis]] ?? 0) + vw;
      }
    }
    return w;
  }

  update(dt: number) {
    const target = this.target(dt);
    for (const k of new Set([...Object.keys(this.weights), ...Object.keys(target)])) {
      const goal = THREE.MathUtils.clamp(target[k] ?? 0, 0, 1);
      // blinks are crisp (the 60 ms / 100 ms curve is already shaped); everything else eases ~0.15 s
      this.weights[k] = k === this.meta.blink ? goal : THREE.MathUtils.damp(this.weights[k] ?? 0, goal, 18, dt);
    }
    for (const { mesh, index } of this.slots)
      for (const [k, i] of Object.entries(index)) mesh.morphTargetInfluences![i] = this.weights[k] ?? 0;
  }

  /** what the meshes currently hold (debug + tests) */
  influences(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const { mesh, index } of this.slots)
      for (const [k, i] of Object.entries(index)) out[k] = Math.max(out[k] ?? 0, mesh.morphTargetInfluences![i]);
    return out;
  }
}
