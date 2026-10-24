export type BehaviorState = "idle" | "wandering" | "reacting" | "conversing" | "sleeping";
export interface BehaviorTickContext { now: number; daylight: number; busy: boolean }
