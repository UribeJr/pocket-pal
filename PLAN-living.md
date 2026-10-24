# PLAN — Tuck's Living Companion Update (plan only, no code changed)

Baseline inspected: `UribeJr/pocket-pal` @ `6a27332` (only commit; only branch `main`; local == remote).

## 0. What exists today

### Implemented functionality
| System | Where | Notes / limits |
|---|---|---|
| CharacterController (`playAnimation, setEmotion, lookAt, moveTo, startConversation, returnToIdle, react, update`) | `src/types/companion.ts`, `src/engine/animation/CharacterControllerImpl.ts` | Single owner of intent. `react('tap')` is hard-wired (hop→happy→idle). `busy` is a bool, no priority levels. `moveTo` only on x (clamped −1.6..1.6), no facing target at arrival. |
| Animation backends | `ProceduralBackend.ts` (active), `GltfBackend.ts` (unused, ready for GLB) | Base-layer crossfade + additive layers (breathe, blink). Blink rate fixed (no slow blink). Unknown clip → `console.warn` + no-op (already a partial fallback). |
| Clip registry | `engine/animation/registry.ts`, `proceduralClips.ts` | Clips: `idle, breathe*, blink*, lookAround, walk, hop, happy, talk, sleep` (*additive). |
| Ambient scheduler | `engine/behavior/idleBehavior.ts` | Fixed 5–11 s timer, 3 hardcoded choices (lookAround 45 %, wander 35 %, doze at night). No weights/cooldowns/recency/energy; disabled in Pocket Mode. |
| Store | `stores/companionStore.ts` (Zustand) | emotion (`neutral/happy/sleepy/curious`), animation, behavior, posX, facing, tapCount, lastInteraction, speech, layout. In-memory only. One persistent Canvas → rotation keeps state (tested). |
| Tap reaction | `engine/interactions/tap.ts` | Wakes if sleepy, vibrates, `react('tap')`. Lines cycle by `tapCount % 4` → repeats forever, no decay. |
| Dialogue bubble | drei `<Html>` in `Tuck.tsx` + `CharacterControllerImpl.say()` | One bubble, 2.6 s timeout. Only tap lines exist. |
| Expressions | `Tuck.tsx` Eyes/Mouth | neutral, happy (^^), sleepy (closed), curious (tall eyes + o mouth). |
| Environment | `components/environment/Diorama.tsx`, `FlipClock.tsx` | Window (x≈−1.75, wall), plant (x −1.3), flip clock (x −0.35, real time, flip anim), lamp (x 1.75), shelf. Positions are literals inside JSX; no metadata. Day/night via `simulation/timeOfDay.ts` (`daylightAt`, `?time=` override). |
| Camera / perf | `CameraRig.tsx`, `Scene.tsx` | DPR ≤ 1.5, `frameloop="never"` when hidden, dt clamped to 1/20. |

### UI placeholders (no functionality — preserve untouched, do NOT build)
- **Tea timer, Note, Wardrobe**: `src/components/interface/PocketPanel.tsx` line 10 — three non-interactive `<span>` chips (no onClick, no state, no routes). These are the only occurrences anywhere in the repo/branches.
- Pocket Mode chat bubbles + "Chat arrives in Phase 2…" input: static placeholders.
- `src/ai/*`: empty stubs. `/api/health`: stub.
This update leaves `PocketPanel.tsx` unchanged (except, optionally, nothing).

## 1. Architecture changes (smallest set; no second state machine)
All new modules live under `src/engine/` (logic, no React) + one config under `src/companion/`. The **CharacterController stays the only thing that plays clips**; everything else issues typed commands to it.

```
src/companion/personality.ts      PersonalityProfile (pure data)
src/engine/behavior/BehaviorEngine.ts   ← evolves idleBehavior.ts (rename/extend, not parallel)
src/engine/behavior/activities.ts       Activity definitions (data + small step scripts)
src/engine/emotion/EmotionController.ts
src/engine/interactions/InteractionMemory.ts  (+ tap.ts calls into it)
src/engine/dialogue/DialogueManager.ts  + dialogue/lines.ts
src/engine/environment/EnvironmentRegistry.ts
src/engine/persistence/SessionPersistence.ts
```

### Typed command boundary
```ts
type Priority = 0 /*ambient*/ | 1 /*activity*/ | 2 /*user interaction*/ | 3 /*system: wake/return*/;
type BehaviorCommand =
  | { kind: "play"; clip: ClipName; fallback?: ClipName[]; loop?: boolean }
  | { kind: "moveTo"; x: number; face?: number }
  | { kind: "lookAt"; target: Vec3Like | null }
  | { kind: "wait"; seconds: number }
  | { kind: "say"; lineKey: string }
  | { kind: "emote"; emotion: Emotion; holdSeconds?: number };
```
Controller gains: `run(activity, priority)` executes a short command list; a higher-priority request cancels the current one (resolves its promise as `"interrupted"`), equal/lower is rejected. Replaces `busy` bool. `playAnimation` gets fallback resolution: `clip → fallback[] → "idle"` (logs once, never throws). This is also the GLB fallback path.

### BehaviorEngine (extends idleBehavior.ts)
Ticked from the existing `useFrame` in `Tuck.tsx` (no new timers). Every decision point (when idle and a "next" countdown elapses) scores activities:
`score = baseWeight(personality) × timeOfDayMul × moodMul × energyMul × recencyPenalty × (cooldownReady ? 1 : 0)`.
- **Quiet periods**: "exist" activity (idle/breathe only, 10–40 s) always present with a high weight; at night and in low energy it dominates. Target: ≥50 % of Desk Mode time is quiet.
- **Energy** 0..1: drains slowly while awake/active, recovers during sit/nap; night drains faster.
- **Recency**: ring buffer of last 5 activities, penalty ×0.2 for last, ×0.5 for others.
- Runs in Pocket Mode too, but with a `pocket` multiplier (no long walks, since camera follows Tuck) — layout only changes weights, not engine.

### EmotionController
States: `content, curious, playful, sleepy, excited, surprised, focused` (store `Emotion` type widened; `neutral` → `content`).
- Each state: `{ expression, blinkRate, moveSpeedMul, activityMul, tapReaction, decayTo, minHold }`.
- Expression mapping onto the 4 existing faces (no redesign): content→neutral, curious/focused→curious, playful/excited→happy, sleepy→sleepy, surprised→curious (+ brief scale-pop). Focused differs from curious only by a lower blink rate + head tilt.
- Arbitration: emotions are *requests* with a priority and `minHold`; they never play clips. Transient emotions (excited, surprised) decay to the mood baseline after N s. Baseline drifts from energy + time of day.

### InteractionMemory
`{ recentCount (decaying), lastTapAt, lastReactionKey, lastVisitAt, totalTaps }`.
- `intensity = recentCount × e^(−Δt/45 s)`; tiers: first (≤1), again (≤3), lots (≤6), flood (>6).
- Reaction choice by tier × emotion × current activity (e.g. tapped while napping → surprised wake-up line + slow open; while inspecting clock → "it's {time}, by the way").
- Lines: never needy/hostile/guilt-tripping (rule in personality boundaries + lint test on lines file).

### DialogueManager
- Sources: tap, activity start/end, time-of-day greeting, return after absence, object comment, minute change at clock.
- Line pool keyed by tags `{trigger, emotion?, timeOfDay?, objectId?, tier?}`; picks a random eligible line, excluding last 8 used (no-repeat buffer).
- Cooldowns: global spontaneous ≥ 4 min in Desk Mode (≥ 2 min Pocket), per-line ≥ 30 min; tap replies exempt from global cooldown but max one bubble at a time. Never asks a question that needs an answer.
- Reuses existing `say()` / `speech` store field / bubble — no UI change.

### EnvironmentRegistry
```ts
interface EnvObject { id: "clock"|"window"|"lamp"|"plant"|"shelf"|string; standX: number; facing: number;
  lookTarget: Vec3Like; actions: EnvAction[]; cooldown: number; }
interface EnvAction { id: "inspect"|"gaze"|"relax"|"sit"; clip: ClipName; fallback?: ClipName[]; duration: [number,number];
  when?: (ctx) => boolean; lineTag?: string }
```
Static data module; `Diorama.tsx` positions move to constants it imports (same values → no visual change). Objects: clock (inspect, react on minute change), window (gaze; stand at x −0.9 because plant blocks the sill — look up/left), lamp (relax/sit nearby when daylight < 0.5), plant (inspect), shelf (sit anywhere). Walk bounds stay −1.6..1.6; no pathfinding (1-D shelf), plant/clock are obstacles → stand-X positions chosen so Tuck never overlaps them.

### PersonalityProfile
Pure data: traits (curious .8, friendly .8, playful .6, sarcastic .3, distractible .6, independent .7, sleepy .4), tone notes, activity base weights, emotion tendencies (baseline, decay speeds), boundaries (no neediness/guilt/hostility, max spontaneous lines/hour). Exported as JSON-serialisable so Phase-2 Groq prompts can embed it verbatim.

### SessionPersistence
- localStorage key `pocketpal.companion.v1` `{v, savedAt, mood, energy, lastActivity, posX, memory summary, totalTaps, daysVisited}`.
- Save: on `visibilitychange→hidden`, `pagehide`, and throttled (≤1/30 s) on meaningful changes. Load before scene mount.
- Catch-up on load/visibility resume: closed-form from Δt — energy recovers if night/long gap, intensity decays to 0, mood → baseline; Δt > 2 h → "return" greeting eligible; Δt > 8 h at night → start in nap & wake on open. No per-second simulation.
- Version + try/catch; corrupt/missing → defaults.

## 2. Animation capabilities

| Behaviour | Existing clip(s) | New procedural work |
|---|---|---|
| Look around / at window / at clock | `lookAround`, controller `lookAt` | none |
| Blink naturally / slow sleepy blink | `blink` additive | **parameterise blink rate/closure** (small) |
| Take a few steps / approach object | `walk` + `moveTo` | add arrival facing (small) |
| Nap | `sleep` + sleepy face | none |
| Happy / excited / playful | `hop`, `happy` | none |
| Talking while bubble shows | `talk` | none |
| **Stretch** | — | **new clip** (arms up, body elongate, 2 s) |
| **Weight shift** | — | **new clip** (body lean side-to-side, foot lift) |
| **Sit** (+ sit idle) | — | **new clips** `sitDown`, `sitIdle`, `standUp` (lower root, feet forward) |
| **Nap enter / wake up** | — | **new** `yawn` / `wakeUp` (stretch variant + eye open) |
| **Inspect** (lean in, head tilt) | partial via `lookAt` | **new clip** `inspect` (lean forward, head tilt, hand to chin) |
| Surprised | — | **new** `startle` (quick squash + hop-back, 0.5 s) |
All new clips go through `registerClip()`; GLB clip names to request later: the same names.

## 3. Phases
1. **Core arbitration** — Controller `run()`/priorities/fallbacks; widen Emotion; EmotionController; PersonalityProfile. *Deliverable:* existing tap still works; unknown clip falls back; unit tests.
2. **Behaviour + new clips** — BehaviorEngine (replaces idleBehavior in place), activities, stretch/weightShift/sit/yawn/wakeUp/inspect/startle, blink params, energy. *Deliverable:* 10-min unattended Desk run shows ≥5 distinct activities, ≥50 % quiet.
3. **Environment** — EnvironmentRegistry, Diorama constants, clock/window/lamp/plant interactions (≥2 meaningful required, target 4). *Deliverable:* visible interactions, no overlaps.
4. **Memory + dialogue** — InteractionMemory, DialogueManager, lines.ts (~80 lines), tap tiers. *Deliverable:* contextual, non-repeating tap replies; quiet Desk Mode.
5. **Persistence + polish** — SessionPersistence, catch-up, return greeting, perf pass, tests, screenshots.

## 4. Performance risks
- Store writes each frame → React re-renders: engine state kept in plain objects/refs; store only receives coarse changes (emotion, speech, activity) — keep `posX` throttled as now.
- `<Html>` bubble re-mounts: keep single instance, toggle content.
- Timers: no `setInterval` per module; everything ticks in the existing `useFrame` (stops when hidden because frameloop = never). The one `say()` timeout → replace with frame-tick expiry.
- localStorage writes: throttled; only on hide/pagehide + 30 s.
- Clip registry growth is O(1); no mixers created per activity (one backend per Tuck mount; dispose on unmount).
- Long sessions: ContactShadows still re-renders every frame (pre-existing); unchanged here, flagged for Phase 4.

## 5. Test plan (Playwright Chromium + WebKit, plus unit tests with a fake clock)
- **Unit**: weighted selection respects cooldowns/recency (seeded RNG); emotion decay; memory decay curve; dialogue no-repeat & cooldown; persistence catch-up for Δt = 1 min / 3 h / 12 h; corrupt storage.
- **Repeated taps**: 1, 3, 8, 20 taps fast → tier progression, no fixed cycle, ≤1 bubble, no stuck `busy`; after 2 min no taps → tier resets.
- **Rapid rotation**: toggle viewport 10× in 3 s mid-activity → same activity/emotion/memory, no duplicate controllers (`__pocketPal` controller identity), no errors.
- **Backgrounding**: `visibilitychange` hidden 30 s → no frames, state saved; visible → resumes with catch-up, no burst of activities.
- **Return after inactivity**: seed localStorage `savedAt` −3 h / −10 h night → return greeting / starts napping.
- **Missing animations**: unregister `sit`, `inspect` → activity falls back to idle/lookAround, warning once, no exceptions.
- **Regression**: Phase-1 screenshots (both layouts, day/night) visually unchanged; placeholder chips present and inert; build passes; frame time sampled over 60 s within 10 % of baseline.

## 6. Out of scope
Groq/AI conversations, voice, new models/GLB, character or UI redesign, tea timer/notes/wardrobe functionality, furniture customisation, multiplayer, physics/pathfinding.
