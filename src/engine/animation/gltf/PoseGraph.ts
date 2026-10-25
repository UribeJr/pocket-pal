/** Per-clip metadata (GLB RIG_Tuck extras `tuck_clips`, keyed by clip name). */
export interface ClipMeta {
  loop: boolean;
  frames?: number;
  seconds: number;
  start_pose: string;
  end_pose: string;
  kind?: string;
}

export interface Step { name: string; fade: number; via: "direct" | "clip" | "fade" }

/**
 * Pose pairs a longer crossfade bridges cleanly where no transition clip exists, measured in the
 * Phase 4 viewer (tuck-character-studio docs/animation-manifest.md): SIT <-> SLEEP_SIT at 0.8 s.
 */
export const FADE_BRIDGES: Record<string, number> = { "SIT>SLEEP_SIT": 0.8, "SLEEP_SIT>SIT": 0.8 };

/**
 * Stance graph built from the clips' own start/end poses: nodes are poses (STAND, SIT, SLEEP_SIT),
 * edges are pose-changing one-shots (sitDown, standUp, wakeUp) plus the measured fade bridges.
 * route() returns the clips to play so a request never blends across incompatible poses.
 */
export class PoseGraph {
  readonly poses: string[];

  constructor(private readonly meta: Record<string, ClipMeta>) {
    this.poses = [...new Set(Object.values(meta).flatMap((m) => [m.start_pose, m.end_pose]))].sort();
  }

  /** the pose's resting loop: the longest loop that starts there (STAND -> idle, SIT -> sitIdle, SLEEP_SIT -> sleep) */
  restLoop(pose: string): string | undefined {
    return Object.entries(this.meta)
      .filter(([, m]) => m.loop && m.start_pose === pose)
      .sort((a, b) => b[1].seconds - a[1].seconds)[0]?.[0];
  }

  route(fromPose: string, target: string, baseFade = 0.3): Step[] {
    const goal = this.meta[target]?.start_pose;
    if (!goal || goal === fromPose || !this.poses.includes(fromPose)) return [{ name: target, fade: baseFade, via: "direct" }];
    const dist: Record<string, number> = { [fromPose]: 0 };
    const prev: Record<string, { pose: string; edge: Step }> = {};
    const open = new Set(this.poses);
    while (open.size) {
      const u = [...open].filter((p) => p in dist).sort((a, b) => dist[a] - dist[b])[0];
      if (!u || u === goal) break;
      open.delete(u);
      const edges: { to: string; cost: number; edge: Step }[] = [];
      for (const [name, m] of Object.entries(this.meta))
        if (!m.loop && m.start_pose === u && m.end_pose !== u) edges.push({ to: m.end_pose, cost: 1, edge: { name, fade: baseFade, via: "clip" } });
      for (const v of this.poses) {
        const f = FADE_BRIDGES[`${u}>${v}`];
        if (f !== undefined) edges.push({ to: v, cost: 1.5, edge: { name: "", fade: f, via: "fade" } });
      }
      for (const e of edges) {
        const d = dist[u] + e.cost;
        if (d < (dist[e.to] ?? Infinity)) { dist[e.to] = d; prev[e.to] = { pose: u, edge: e.edge }; }
      }
    }
    if (!(goal in prev)) return [{ name: target, fade: baseFade, via: "direct" }];
    const path: Step[] = [];
    for (let p = goal; p !== fromPose; p = prev[p].pose) path.unshift(prev[p].edge);
    const steps: Step[] = [];
    let fade = baseFade;
    for (const e of path) {
      if (e.via === "fade") fade = e.fade; // lengthens the next clip's crossfade
      else { steps.push({ ...e, fade }); fade = baseFade; }
    }
    steps.push({ name: target, fade, via: path.at(-1)?.via === "fade" ? "fade" : "direct" });
    return steps;
  }
}
