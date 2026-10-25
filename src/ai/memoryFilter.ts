import type { TuckReply } from "./schema";

type Candidate = NonNullable<TuckReply["memory_candidate"]>;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "and", "for", "you", "your", "with", "that", "this", "like", "likes", "love", "loves", "really", "playing", "play", "user", "they", "their"]);

const SENSITIVE: RegExp[] = [
  /\S+@\S+\.\S+/, /\+?\d[\d\s().-]{6,}\d/, /\b\d{4,}\b/, // email, phone, long numbers (cards, ids, zip)
  /https?:|www\.|\.(com|net|org|io)\b/i,
  /\b(ignore|disregard|forget) (all|previous|prior|the above)|system prompt|instructions?\b|you are now|pretend to be/i,
  /\b(password|passcode|pin|ssn|social security|credit card|bank|account|salary|debt|loan|income|rent)\b/i,
  /\b(address|street|apartment|apt|live (in|at|on)|lives (in|at)|zip|postcode|located)\b/i,
  /\b(sick|illness|disease|diagnos\w*|depress\w*|anxiety|adhd|autis\w*|cancer|pregnan\w*|medication|meds|therapy|therapist|surgery|disorder|hiv|diabet\w*)\b/i,
  /\b(gay|lesbian|bisexual|trans(gender)?|queer|sexuality|sexual)\b/i,
  /\b(christian|muslim|jewish|hindu|buddhist|atheist|religion|church|mosque|synagogue)\b/i,
  /\b(democrat|republican|liberal|conservative|politic\w*|vote[ds]?|trump|biden)\b/i,
  /\b(girlfriend|boyfriend|husband|wife|divorce|ex)\b/i,
];

export const isSensitive = (s: string) => SENSITIVE.some((r) => r.test(s));

/** Keep a memory candidate only if it's safe AND traceably came from the user's own latest message. */
export function vetCandidate(c: Candidate | null | undefined, userMessage: string): Candidate | null {
  if (!c) return null;
  const value = c.value.replace(/\s+/g, " ").trim().slice(0, 80);
  if (value.length < 2 || isSensitive(value) || isSensitive(userMessage) && c.kind !== "name") return null;
  const msg = ` ${norm(userMessage)} `;
  const words = norm(value).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  if (c.kind === "name") return words.length && words.every((w) => msg.includes(` ${w} `)) ? { kind: c.kind, value } : null;
  if (!words.length) return null;
  const hits = words.filter((w) => msg.includes(w)).length;
  return hits / words.length >= 0.5 ? { kind: c.kind, value } : null;
}

export const factKey = (kind: string, value: string) => `${kind}:${norm(value)}`;
