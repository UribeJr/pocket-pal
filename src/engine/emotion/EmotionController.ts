import type { Emotion, Face, Priority } from "@/types/companion";
import { tuckPersonality, type PersonalityProfile } from "@/companion/personality";

export interface EmotionStyle {
  face: Face;
  /** multiplier on blink frequency (1 = default 4.3 s cycle) */
  blinkRate: number;
  /** multiplier on locomotion speed */
  speed: number;
}

/** Emotion → what the body can actually show. Emotions never play animation clips. */
export const EMOTION_STYLE: Record<Emotion, EmotionStyle> = {
  content:   { face: "neutral", blinkRate: 1,    speed: 1 },
  curious:   { face: "curious", blinkRate: 1.1,  speed: 1 },
  focused:   { face: "neutral", blinkRate: 0.55, speed: 0.8 }, // study sessions: calm face, slow blinks
  playful:   { face: "happy",   blinkRate: 1.3,  speed: 1.3 },
  excited:   { face: "happy",   blinkRate: 1.5,  speed: 1.4 },
  surprised: { face: "curious", blinkRate: 0.3,  speed: 1 },
  sleepy:    { face: "sleepy",  blinkRate: 0.5,  speed: 0.6 },
};

export const faceFor = (e: Emotion | string): Face => (EMOTION_STYLE as Record<string, EmotionStyle>)[e]?.face ?? "neutral";

/**
 * Arbitrates emotion requests. A request wins if its priority >= the held emotion's priority,
 * or the held emotion's hold time has expired. Transient emotions decay to the baseline.
 */
export class EmotionController {
  private current: Emotion;
  private priority: Priority = 0;
  private holdUntil = 0; // clock seconds; Infinity = until replaced
  private t = 0;
  private baseline: Emotion;

  constructor(initial: Emotion = "content", private onChange: (e: Emotion) => void = () => {}, private profile: PersonalityProfile = tuckPersonality) {
    this.current = initial;
    this.baseline = profile.emotionalTendencies.baseline as Emotion;
  }

  get emotion() { return this.current; }
  get style() { return EMOTION_STYLE[this.current]; }

  /** hold: seconds, defaults from personality for transients, Infinity otherwise */
  request(e: Emotion, priority: Priority = 1, hold?: number): boolean {
    const expired = this.t >= this.holdUntil;
    if (!expired && priority < this.priority) return false;
    const transient = this.profile.emotionalTendencies.transientHold as Record<string, number>;
    const h = hold ?? transient[e] ?? Infinity;
    this.priority = priority;
    this.holdUntil = this.t + h;
    if (e !== this.current) { this.current = e; this.onChange(e); }
    return true;
  }

  /** baseline mood (time-of-day / energy driven from Phase 2 on) */
  setBaseline(e: Emotion) { this.baseline = e; }

  update(dt: number) {
    this.t += dt;
    if (this.t >= this.holdUntil && this.current !== this.baseline) {
      this.priority = 0; this.holdUntil = Infinity;
      this.current = this.baseline; this.onChange(this.baseline);
    } else if (this.t >= this.holdUntil) {
      this.priority = 0;
    }
  }
}
