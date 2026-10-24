import type { CharacterControllerImpl } from "@/engine/animation/CharacterControllerImpl";
let active: CharacterControllerImpl | null = null;
export const setActiveController = (c: CharacterControllerImpl | null) => { active = c; };
export const getActiveController = () => active;
