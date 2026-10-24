# Pocket Pal — Build Plan

North star: *"A tiny life happening alongside yours."* Art direction: **B · Tuck, Modern Miniature** (see `../design/notes.md`).

## Phase 1 — 3D Foundation ✅ (this directory)
- Next.js 15 (App Router) + TS, Tailwind v4, three 0.170 + @react-three/fiber 9 + drei 10, Zustand 5.
- **Stand-in Tuck** built from primitives (`src/components/character/Tuck.tsx`), groups named as rig bones:
  `root, body, head, cap, leaf, eyes, armL, armR, footL, footR`.
- **CharacterController** (`src/types/companion.ts`, impl `src/engine/animation/CharacterControllerImpl.ts`):
  `playAnimation, setEmotion, lookAt, moveTo, startConversation, returnToIdle` (+ `react`, `update`).
  It talks only to an `AnimationBackend` → `ProceduralBackend` today, `GltfBackend` (AnimationMixer crossfades) later.
- **Clip registry** (`src/engine/animation/registry.ts`): `registerClip()` adds clips without touching the controller.
  Procedural clips: idle, breathe + blink (additive), lookAround, walk, hop, happy, talk, sleep. Base clips crossfade with normalised weights.
- Ambient behaviour stub (`engine/behavior/idleBehavior.ts`): look-around, wander along the shelf, doze at night.
- Tap Tuck → hop → happy wiggle, ^^ eyes, speech bubble, back to idle.
- Diorama: shelf, arched window (sky/moon/stars), plant, lamp with shadow-casting point light, built-in wooden flip clock (real time, flip animation, Fraunces digits). Day/night purely via lighting (`engine/simulation/timeOfDay.ts`; `?time=HH:MM` override for testing).
- Layouts: landscape = Desk Mode (full scene, caption row in safe areas), portrait = Pocket Mode (Tuck on top, placeholder chat/profile panel). `/desk`, `/pocket` force a mode. **One persistent Canvas + Zustand store** → rotating never resets state.
- Perf: DPR capped [1, 1.5], `frameloop="never"` while `document.hidden`, low-power GL, delta clamped.
- Installable manifest + icons (no service worker yet).

## Phase 2 — Conversation & Personality
- `src/ai/{providers,personality,prompts,schemas}`: provider abstraction (server-side route in `src/app/api`, keys in env only), Tuck persona + memory prompt, zod schemas for structured replies (`{text, emotion, animation, action}`) so replies drive the CharacterController.
- Real Pocket Mode chat UI (bubbles as in mock), streaming, `startConversation()` / `returnToIdle()` hooks.
- Supabase: auth (anonymous → linked), conversation + memory tables, RLS.

## Phase 3 — Living Behaviour & Tools
- Behaviour engine (needs/mood simulation, schedules, day-cycle routines, sleep), idle variety, plant care, "lamp left on".
- Tools as character actions (tea timer Tuck holds, notes), notifications, wardrobe/customization data model.
- Interactions: drag/pet, long-press, device tilt parallax, haptics.

## Phase 4 — PWA, Polish, Ship
- Service worker/offline (Serwist or similar), asset caching for GLB/textures, install prompts, iOS splash screens.
- Always-on Desk Mode power budget: adaptive frame rate (30fps idle / `demand` when static), wake-lock option, low-power/pixel night mode.
- Accessibility, reduced motion, analytics, error reporting, deploy.

## ⚠️ Open decision — real character model & rig (scope separately)
Phase 1 ships a **procedural stand-in**. The production Tuck needs its own scoped piece of work:
- **Option A: Blender → rigged GLB** (glTF, Draco/meshopt, KTX2). Fits the current R3F pipeline directly: drop `public/models/tuck.glb`, set `characterConfig.modelUrl`, map clip names in `clipMap`; `GltfBackend` gives crossfades. Needs: modeling/clay-felt materials, rig with bone names above (or mapping), clips `idle, walk, hop, happy, talk, sleep, lookAround`, blink via shape key / face texture, budget ≲ 15k tris, < 1.5 MB.
- **Option B: Rive** (notes.md's preferred animation tool): 2D/2.5D state machine with mood blend states, very light and battery-friendly, but it replaces the 3D diorama look (or sits as a layer in it) and would need a `RiveBackend` behind the same `AnimationBackend`/controller interface.
- Decision inputs: art budget, how "3D" Desk Mode must feel, battery targets for always-on, outfit/customization multiplier. The controller/store/behaviour code is unchanged in either case.
