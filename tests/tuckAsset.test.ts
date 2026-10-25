import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLB_PATH, glbJson, loadTuckGlb } from "./helpers/tuckGlb";
import { listClips, getClip } from "@/engine/animation/registry";
import "@/engine/animation/proceduralClips";
import "@/engine/animation/livingClips";
import { characterConfig } from "@/lib/characterConfig";

/** the approved Phase 4 baseline (tuck-character-studio/exports/baselines/tuck_phase4_baseline.glb) */
const BASELINE_MD5 = "df90636e237c9e896cce7ea0b72c9345";
const CLIPS = ["idle", "walk", "hop", "sitDown", "sitIdle", "standUp", "sleep", "wakeUp", "stretch", "inspect", "startle", "wave", "talk"];
const MORPHS = ["Cheek_Raise", "Eye_Blink", "Eye_Happy", "Eye_Sleepy", "Eye_Tall", "Eye_Wide", "Mouth_O", "Mouth_OBig", "Mouth_Open", "Mouth_Small", "Mouth_SmileBig", "Mouth_Wide"];

describe("tuck.glb asset", () => {
  it("is the approved, unmodified baseline", () => {
    expect(createHash("md5").update(readFileSync(GLB_PATH)).digest("hex")).toBe(BASELINE_MD5);
  });

  it("has the 13 approved clips, 12 morph targets, and the rig metadata", () => {
    const j = glbJson();
    expect(j.animations.map((a: { name: string }) => a.name).sort()).toEqual([...CLIPS].sort());
    const morphs = new Set(j.meshes.flatMap((m: { extras?: { targetNames?: string[] } }) => m.extras?.targetNames ?? []));
    expect([...morphs].sort()).toEqual(MORPHS);
    const rig = j.nodes.find((n: { name: string }) => n.name === "RIG_Tuck");
    expect(Object.keys(rig.extras).sort()).toEqual(["tuck_bone_map", "tuck_clips", "tuck_face"]);
    expect(rig.extras.tuck_clips.sitIdle.loop).toBe(true);
    expect(rig.extras.tuck_clips.sleep.start_pose).toBe("SLEEP_SIT");
  });

  it("parses in three.js with the app's bone map on the correct sides", async () => {
    const g = await loadTuckGlb();
    expect(g.animations).toHaveLength(13);
    const rig = g.scene.getObjectByName("RIG_Tuck")!;
    g.scene.updateMatrixWorld(true);
    const x = (app: string) => {
      const row = (rig.userData.tuck_bone_map as { pocket_pal: string; three_name: string }[]).find((b) => b.pocket_pal === app)!;
      return g.scene.getObjectByName(row.three_name)!.getWorldPosition(new THREE.Vector3()).x;
    };
    expect(x("armL")).toBeLessThan(0);
    expect(x("footL")).toBeLessThan(0);
    expect(x("armR")).toBeGreaterThan(0);
    const box = new THREE.Box3().setFromObject(g.scene);
    expect(Math.abs(box.min.y)).toBeLessThan(1e-3); // stands on y = 0, like the stand-in
  });

  it("every clip the app can request is a GLB clip, an alias of one, or one of the 6 baked legacy clips", () => {
    const glb = new Set(CLIPS);
    const base = listClips().filter((n) => getClip(n)!.layer === "base");
    const baked = base.filter((n) => !glb.has(n) && !(n in characterConfig.clipAliases)).sort();
    expect(baked).toEqual(["flip", "happy", "lookAround", "pinNote", "weightShift", "yawn"]);
    for (const [from, to] of Object.entries(characterConfig.clipAliases)) {
      expect(base, from).toContain(from);
      expect(glb.has(to), to).toBe(true);
    }
  });
});
