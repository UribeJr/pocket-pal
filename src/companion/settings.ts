"use client";
import { create } from "zustand";
import { z } from "zod";
import { browserKV, load, save } from "./persist";

/** Study preferences (pocketpal:v1:settings). Durations in minutes; nothing personal is stored here. */
export const StudySettings = z.object({
  focusMin: z.number().min(1).max(120),
  shortMin: z.number().min(1).max(60),
  longMin: z.number().min(1).max(90),
  longEvery: z.number().int().min(2).max(8),
  autoStartBreaks: z.boolean(),
  autoStartFocus: z.boolean(),
  /** opt-in: a system notification when a phase ends while the tab is in the background */
  notify: z.boolean(),
  /** opt-in: a soft chime at phase changes */
  sound: z.boolean(),
});
export type StudySettings = z.infer<typeof StudySettings>;

export const DEFAULT_SETTINGS: StudySettings = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStartBreaks: true, autoStartFocus: false, notify: false, sound: false };

interface SettingsStore { settings: StudySettings; hydrate(): StudySettings; update(p: Partial<StudySettings>): StudySettings }
export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrate() { const kv = browserKV(); const s = kv ? load(kv, "settings", StudySettings, DEFAULT_SETTINGS) : DEFAULT_SETTINGS; set({ settings: s }); return s; },
  update(p) {
    const r = StudySettings.safeParse({ ...get().settings, ...p });
    if (!r.success) return get().settings;
    set({ settings: r.data });
    const kv = browserKV(); if (kv) save(kv, "settings", r.data);
    return r.data;
  },
}));
