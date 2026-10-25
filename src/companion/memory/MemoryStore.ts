import { z } from "zod";
import { MEMORY_KINDS } from "@/ai/schema";
import { factKey, isSensitive } from "@/ai/memoryFilter";
import { load, save, type KV } from "../persist";

export const MEMORY_CAP = 50;
export const Fact = z.strictObject({ id: z.string(), kind: z.enum(MEMORY_KINDS), value: z.string().min(1).max(80), createdAt: z.number(), lastUsedAt: z.number(), source: z.literal("user") });
export type Fact = z.infer<typeof Fact>;
const State = z.strictObject({ enabled: z.boolean(), facts: z.array(Fact).max(MEMORY_CAP) });
type State = z.infer<typeof State>;

/** Storage-agnostic interface so a Supabase implementation can drop in later. */
export interface MemoryStore {
  list(): Fact[];
  add(kind: Fact["kind"], value: string): Fact | null;
  remove(id: string): void;
  clear(): void;
  has(kind: string, value: string): boolean;
  enabled(): boolean;
  setEnabled(on: boolean): void;
  relevant(message: string, n?: number): string[];
}

export class LocalMemoryStore implements MemoryStore {
  private s: State;
  constructor(private kv: KV | null, private now = () => Date.now()) { this.s = load(kv, "memory", State, { enabled: true, facts: [] }); }
  private persist() { save(this.kv, "memory", this.s); }
  list() { return [...this.s.facts].sort((a, b) => b.createdAt - a.createdAt); }
  enabled() { return this.s.enabled; }
  setEnabled(on: boolean) { this.s.enabled = on; this.persist(); }
  has(kind: string, value: string) { const k = factKey(kind, value); return this.s.facts.some((f) => factKey(f.kind, f.value) === k); }
  add(kind: Fact["kind"], value: string) {
    value = value.trim().slice(0, 80);
    if (!this.s.enabled || !value || isSensitive(value) || this.has(kind, value)) return null;
    const t = this.now();
    const f: Fact = { id: `${t.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind, value, createdAt: t, lastUsedAt: t, source: "user" };
    this.s.facts.push(f);
    if (this.s.facts.length > MEMORY_CAP) this.s.facts = [...this.s.facts].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MEMORY_CAP);
    this.persist(); return f;
  }
  remove(id: string) { this.s.facts = this.s.facts.filter((f) => f.id !== id); this.persist(); }
  clear() { this.s.facts = []; this.persist(); }
  /** up to n facts, keyword matches first then most recently used; marks them used */
  relevant(message: string, n = 8) {
    if (!this.s.enabled) return [];
    const m = message.toLowerCase();
    const score = (f: Fact) => (f.kind === "name" ? 2 : 0) + (f.value.toLowerCase().split(/\s+/).some((w) => w.length > 2 && m.includes(w)) ? 1 : 0);
    const picked = [...this.s.facts].sort((a, b) => score(b) - score(a) || b.lastUsedAt - a.lastUsedAt).slice(0, n);
    const t = this.now(); picked.forEach((f) => (f.lastUsedAt = t)); if (picked.length) this.persist();
    return picked.map((f) => `${f.kind === "name" ? "user's name" : `user ${f.kind}`}: ${f.value}`);
  }
}
