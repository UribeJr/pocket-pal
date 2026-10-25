import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadTuckGlb } from "./helpers/tuckGlb";
import { GltfBackend } from "@/engine/animation/GltfBackend";
import { mapBones, type BoneMapEntry } from "@/engine/animation/gltf/boneMap";
import { HEAD_LIMIT, limitHead } from "@/engine/animation/gltf/bakeProcedural";
import { bindFaceToStore } from "@/engine/animation/gltf/faceBinding";
import { PoseGraph } from "@/engine/animation/gltf/PoseGraph";
import { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
import { getClip } from "@/engine/animation/registry";
import { handleTuckTap } from "@/engine/interactions/tap";
import { characterConfig } from "@/lib/characterConfig";
import { useCompanionStore } from "@/stores/companionStore";
import { PRIORITY } from "@/types/companion";
import type { BoneName } from "@/types/animation";

/** the real tuck.glb, parsed once; every test builds its own clone + backend */
let gltf: GLTF;
beforeAll(async () => { gltf = await loadTuckGlb(); });

function makeRig() {
  const scene = gltf.scene.clone(true);
  const container = new THREE.Object3D();
  container.position.set(0.9, 0, 0.1);
  container.add(scene);
  const rigNode = scene.getObjectByName("RIG_Tuck")!;
  const bones = mapBones(scene, rigNode.userData.tuck_bone_map as BoneMapEntry[]);
  const backend = new GltfBackend(
    { scene, container, bones, clips: gltf.animations, clipMeta: rigNode.userData.tuck_clips, faceMeta: rigNode.userData.tuck_face },
    { aliases: characterConfig.clipAliases, walkYaw: characterConfig.walkYaw, random: () => 0.5 },
  );
  return { scene, container, bones, backend };
}
const run = (b: GltfBackend, secs: number, step = 1 / 60) => { for (let t = 0; t < secs; t += step) b.update(step); };
const tick = (c: CharacterControllerImpl, secs: number, step = 1 / 60) => { for (let t = 0; t < secs; t += step) c.update(step); };

beforeEach(() => {
  useCompanionStore.setState({ emotion: "content", animation: "idle", posX: 0.9, facing: 0, tapCount: 0, speech: null, behavior: "idle", layout: "desk" });
});

describe("clip catalogue", () => {
  it("serves the GLB clips, the baked legacy clips and the aliases; unknown clips stay unknown", () => {
    const { backend } = makeRig();
    expect(backend.baked.sort()).toEqual(["flip", "happy", "lookAround", "pinNote", "weightShift", "yawn"]);
    for (const n of ["idle", "walk", "sleep", "wakeUp", "happy", "flip", "sitKnit"]) expect(backend.has(n), n).toBe(true);
    expect(backend.has("doesNotExist")).toBe(false);
  });

  it("takes loop flags from the GLB metadata, not from names", () => {
    const { backend } = makeRig();
    for (const n of ["idle", "walk", "talk", "sleep", "sitIdle", "sitKnit"]) expect(backend.isLoop(n), n).toBe(true);
    for (const n of ["hop", "sitDown", "standUp", "wakeUp", "wave", "happy", "flip"]) expect(backend.isLoop(n), n).toBe(false);
  });

  it("baked clips equal the legacy procedural offsets on the GLB nodes (head limited for the rig)", () => {
    const { backend, bones } = makeRig();
    const rest = Object.fromEntries(Object.entries(bones).map(([n, o]) => [n, { p: o.position.clone(), r: o.rotation.clone() }]));
    for (const name of ["happy", "lookAround", "yawn"]) {
      backend.play(name, { fade: 0 });
      backend.update(0);
      run(backend, 0.6);
      const t = backend.debug().time;
      const pose = limitHead(structuredClone(getClip(name)!.sample(t, { speed: 1 })));
      for (const b of ["body", "head", "armL", "armR"] as BoneName[]) {
        const want = new THREE.Euler(rest[b].r.x + (pose[b]?.r?.[0] ?? 0), rest[b].r.y + (pose[b]?.r?.[1] ?? 0), rest[b].r.z + (pose[b]?.r?.[2] ?? 0));
        const got = bones[b].quaternion.angleTo(new THREE.Quaternion().setFromEuler(want));
        expect(got, `${name} ${b}`).toBeLessThan(0.02);
      }
      expect(Math.abs(bones.head.rotation.y)).toBeLessThanOrEqual(HEAD_LIMIT.yaw + 1e-3);
    }
  });
});

describe("pose router", () => {
  it("STAND -> sleep sits down first, then dozes off with the 0.8 s fade", () => {
    const { backend } = makeRig();
    backend.play("idle"); run(backend, 0.5);
    backend.play("sleep");
    expect(backend.debug().inCharge).toBe("sitDown");
    expect(backend.debug().queue).toEqual(["sleep"]);
    run(backend, 1.3);
    expect(backend.debug().inCharge).toBe("sleep");
    expect(backend.log.at(-1)).toMatchObject({ name: "sleep", fade: 0.8, via: "fade" });
    expect(backend.pose).toBe("SLEEP_SIT");
  });

  it("an autonomous request while asleep wakes up first; a user tap stands up at once", () => {
    const asleep = () => { const r = makeRig().backend; r.play("sleep"); run(r, 2.5); expect(r.pose).toBe("SLEEP_SIT"); return r; };
    const a = asleep();
    a.play("walk", { priority: PRIORITY.activity });
    expect(a.debug().inCharge).toBe("wakeUp");
    expect(a.debug().queue).toEqual(["walk"]);
    const b = asleep();
    b.play("hop", { priority: PRIORITY.user, fade: 0.08 });
    expect(b.debug().inCharge).toBe("hop");
    expect(b.log.at(-1)).toMatchObject({ name: "hop", via: "urgent", fade: 0.35 });
  });

  it("seated focus: sitKnit plays the approved sitIdle and needs no bridge after sitDown", () => {
    const { backend } = makeRig();
    backend.play("sitDown"); run(backend, 1.2);
    backend.play("sitKnit");
    expect(backend.debug().inCharge).toBe("sitIdle");
    expect(backend.current()).toBe("sitKnit");
    backend.play("idle");
    expect(backend.debug().inCharge).toBe("standUp");
  });

  it("a stance change that is already done is skipped and still reports finished", () => {
    const { backend } = makeRig();
    backend.play("idle"); run(backend, 0.2);
    let done = 0;
    backend.play("standUp", { onFinished: () => done++ });
    expect(backend.debug().inCharge).toBe("idle");
    backend.update(1 / 60);
    expect(done).toBe(1);
  });

  it("onFinished is per request: an interrupted one-shot never reports, the new one reports once", () => {
    const { backend } = makeRig();
    let first = 0, second = 0;
    backend.play("hop", { onFinished: () => first++ });
    run(backend, 0.3);
    backend.play("wave", { onFinished: () => second++ });
    run(backend, 3);
    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it("restarting a running one-shot does not jump: the twin fades in while the first fades out", () => {
    const { backend } = makeRig();
    backend.play("hop"); run(backend, 0.4);
    backend.play("hop", { fade: 0.2 });
    const layers = backend.debug().layers.filter((l) => l.clip === "hop");
    expect(layers.length).toBe(2);
  });

  it("route table matches the Phase 4 measurements", () => {
    const g = new PoseGraph(makeRig().backend.meta);
    expect(g.route("STAND", "sleep").map((s) => s.name)).toEqual(["sitDown", "sleep"]);
    expect(g.route("SLEEP_SIT", "idle").map((s) => s.name)).toEqual(["wakeUp", "idle"]);
    expect(g.route("SIT", "walk").map((s) => s.name)).toEqual(["standUp", "walk"]);
    expect(g.route("SIT", "sleep")).toEqual([{ name: "sleep", fade: 0.8, via: "fade" }]);
    expect(g.restLoop("STAND")).toBe("idle");
  });
});

describe("overlay, root and walking", () => {
  it("head look-at never accumulates and stays within the rig limit; the rest goes to the body", () => {
    const { backend, bones } = makeRig();
    backend.play("idle", { fade: 0 });
    backend.setOverlay({ head: { r: [0, 0.7, 0] } });
    run(backend, 10);
    expect(bones.head.rotation.y).toBeLessThan(HEAD_LIMIT.yaw + 0.05);
    expect(bones.body.rotation.y).toBeGreaterThan(0.3);
    backend.setOverlay({});
    run(backend, 0.1);
    expect(Math.abs(bones.head.rotation.y)).toBeLessThan(0.1);
    expect(Math.abs(bones.body.rotation.y)).toBeLessThan(0.1);
  });

  it("the controller keeps owning the container: x, z and yaw survive; walking turns 1.2 rad and syncs the rate", async () => {
    const { backend, container } = makeRig();
    const c = new CharacterControllerImpl(backend, container, null);
    const p = c.run([{ kind: "moveTo", x: 0 }, { kind: "wait", seconds: 0.6 }], PRIORITY.activity, "walk");
    tick(c, 0.8);
    expect(container.rotation.y).toBeCloseTo(-1.2, 1);
    const ts = backend.debug().walkTimeScale!;
    expect(ts).toBeGreaterThan(0.85); // 0.45 * sin(1.2) / 0.45 = 0.93 once turned
    expect(ts).toBeLessThan(1.0);
    tick(c, 4);
    expect(await p).toBe("done");
    expect(Math.abs(container.position.x)).toBeLessThan(0.05);
    expect(container.position.z).toBeCloseTo(0.1, 3);
  });

  it("walking in place after arrival swaps to idle (stall guard)", async () => {
    const { backend, container } = makeRig();
    const c = new CharacterControllerImpl(backend, container, null);
    void c.run([{ kind: "moveTo", x: 0.5 }, { kind: "wait", seconds: 2 }], PRIORITY.activity, "walk");
    tick(c, 1.5);
    expect(backend.current()).toBe("walk");
    expect(backend.debug().inCharge).toBe("idle");
    expect(backend.debug().stalled).toBe(true);
  });
});

describe("controller flows on the GLB", () => {
  it("falling asleep from standing routes through sitDown; a tap wakes him into the hop at once", () => {
    const { backend, container } = makeRig();
    const c = new CharacterControllerImpl(backend, container, null);
    tick(c, 0.3);
    c.setEmotion("sleepy", PRIORITY.activity, Infinity);
    c.returnToIdle();
    expect(backend.debug().inCharge).toBe("sitDown");
    tick(c, 2);
    expect(backend.debug().inCharge).toBe("sleep");
    handleTuckTap(c);
    expect(backend.debug().inCharge).toBe("hop");
    tick(c, 3);
    expect(backend.log.map((l) => l.name)).toContain("happy");
  });

  it("missing clips still fall back through the chain", async () => {
    const { backend, container } = makeRig();
    const c = new CharacterControllerImpl(backend, container, null);
    const r = c.run([{ kind: "play", clip: "doesNotExist", fallback: ["lookAround"] }], PRIORITY.user, "fallback");
    tick(c, 4);
    expect(await r).toBe("done");
    expect(backend.log.map((l) => l.name)).toContain("lookAround");
  });
});

describe("face", () => {
  it("follows the emotion and speech, blinks, and the mixer never touches morph influences", () => {
    const { backend, scene } = makeRig();
    const unbind = bindFaceToStore(backend.face!);
    expect(backend.face!.meshCount).toBe(7);
    useCompanionStore.getState().set({ emotion: "playful" });
    backend.play("walk", { fade: 0 });
    run(backend, 0.5);
    expect(backend.face!.influences().Eye_Happy).toBeGreaterThan(0.95);
    useCompanionStore.getState().set({ speech: "hello there, how are you" });
    let visemeFrames = 0, mixerChanged = 0;
    const mouth = scene.getObjectByName("SM_Tuck_Mouth") as THREE.Mesh;
    for (let i = 0; i < 90; i++) {
      const before = [...mouth.morphTargetInfluences!];
      backend.mixer.update(1 / 60);
      if (mouth.morphTargetInfluences!.some((v, k) => v !== before[k])) mixerChanged++;
      backend.update(1 / 60);
      const inf = backend.face!.influences();
      if ((inf.Mouth_Open ?? 0) + (inf.Mouth_O ?? 0) + (inf.Mouth_Wide ?? 0) > 0.2) visemeFrames++;
    }
    expect(mixerChanged).toBe(0);
    expect(visemeFrames).toBeGreaterThan(20);
    useCompanionStore.getState().set({ speech: null, emotion: "content" });
    backend.face!.blink();
    let peak = 0;
    for (let i = 0; i < 12; i++) { backend.update(1 / 60); peak = Math.max(peak, backend.face!.influences().Eye_Blink ?? 0); }
    expect(peak).toBeGreaterThan(0.9);
    backend.setSpeed("blink", 0.5);
    expect(backend.face!.blinkRate).toBe(0.5);
    unbind();
    backend.dispose();
  });
});
