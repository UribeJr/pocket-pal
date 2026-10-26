---
title: "Tuck: a tiny acorn who turns \"ugh, my essay\" into one 25-minute goal"
published: false
tags: devchallenge, hf26challenge, ai, opensource
cover_image: https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/01-hero.png
---

<!-- DRAFT for review before publishing: check every claim, the links, and that the GitHub repo is public with a license. -->

*This is a submission for [Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19).*

## What I Built

**Pocket Pal** is a calm Pomodoro timer with a focus partner: **Tuck**, a small 3D acorn in a leaf hat who sits beside your timer.

The hard part of focusing usually isn't the 25 minutes. It's deciding what to do with them. So Tuck does that part:

1. You type what you're working on ("my history essay") and press **Start**.
2. Tuck, powered by the open-weight **gpt-oss-20b**, turns it into **one goal that fits the session**: *"Draft the intro paragraph. Just that."*
3. He sits down and works quietly next to you.
4. When the timer ends he asks **"Did you finish?"** You tap **Yes**, **Almost** or **Not yet**. He hops, nods or tilts his head kindly, then suggests the next small step.

![Tuck asks "Did you finish?"; you tap Yes and he hops: "Yes! You did it!", then suggests the next goal](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/10-checkin-hop.gif)

When you get stuck mid-session, **Ask Tuck** has four one-tap buttons: *Plan this session*, *I'm stuck*, *I'm distracted* and *Quiz me*. Replies are a sentence or two, because a focus partner shouldn't become the distraction.

## Demo

**Live:** https://pocket-pal-teal.vercel.app. Try typing a task and pressing Start. To see the check-in without waiting 25 minutes, set Focus to 1 minute in Settings.

Every screenshot below is the live app with real gpt-oss replies.

**1. Type four words.**
![The timer reads 25:00 with "my history essay" typed under it; Tuck stands beside it in a soft studio room](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/02-what-are-you-working-on.png)

**2. Tuck turns them into one goal that fits the session**, then sits down and works with you.
![Mid-session at 18:38: the goal line reads "Draft the intro paragraph" and Tuck says "Let's get that intro shining!"](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/03-tuck-sets-one-goal.png)

**3. When the timer ends, he checks in**, with no verdict until you answer.
![Short break: "Did you finish: Draft the intro paragraph?" with Yes, Almost and Not yet buttons; Tuck asks "Time's up! How did it go?"](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/04-did-you-finish.png)

**4. Tap Yes, and he jumps.**
![Tuck mid-hop with his shadow on the floor, saying "Yes! You did it!"](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/05-yes-you-did-it.png)

**5. The next small step is ready** for your next Start, with no extra AI call.
![Tuck smiling, "Great job, you nailed it!", with "Next · Outline main arguments" under the timer](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/06-next-goal.png)

**It works on your phone too.**
![Phone layout: the timer at 15:15 on top, Tuck in the middle saying "Ready to ace those biology flashcards?", goal "Review one flashcard set"](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/09-phone.png)

## Code

{% github UribeJr/pocket-pal %}

## How I Built It

- **Frontend:** Next.js 15, React 19 and TypeScript. Tuck was modelled and rigged in Blender, exported as a GLB, and rendered with React Three Fiber.
  - He lives in a soft "infinity cove" studio room. The camera frames him with a view offset, so the room flows behind the timer as one space.
  - His moods drive a small emotion system: faces, blink rate, and an allowlist of animation clips such as hop, stretch, sit and wave.
- **The timer** is pure timestamps, so a reload, a background tab or a laptop asleep for three hours never loses or double-counts a session.
- **The AI loop:** each Pomodoro makes about two small calls to `openai/gpt-oss-20b` on Groq: one at Start (the goal) and one at the check-in (the reaction and the next goal).
  - Replies use a strict JSON schema: `line`, `goal`, `emotion`, `action`.
  - The server validates them with zod. Nothing the model writes becomes HTML.
- **The model suggests; the app decides the body.** Tuck's check-in reaction (hop, nod or head tilt) is chosen by the app from your answer, never by the model. The model can only pick from a short list of safe moods.
- **Guardrails in the prompt, not in a filter:**
  - *Quiz me* asks one question and grades your answer in your own words.
  - "Write my essay" becomes "let's outline it together".
  - Stress gets a warm acknowledgement before any suggestion.
  - Time questions are answered from the real timer state ("You've been focusing for 12 minutes").

![Ask Tuck: "What does a thesis statement do?", the answer graded "Correct! That's spot on." with a one-sentence explanation and a next question](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/07-quiz-me-graded.png)

![Ask Tuck: "I'm so stressed, I want to quit." answered with "That sounds like a lot right now." then a short break and one small next step](https://raw.githubusercontent.com/UribeJr/pocket-pal/main/docs/submission/08-stressed-warm-reply.png)

**The bug that taught me the most.** After two good replies, every message said *"Ask Tuck isn't connected. It needs its AI key"*, even though the key was right there. The production logs told a different story: Groq was returning `400 tool_use_failed`. gpt-oss sometimes decides to call a tool, even with no tools defined. My error handling lumped every unexpected 400 into "misconfigured", and the UI showed that as "no key".

The fix had three parts:
- Treat it as a bad sample: resample once, cooler, and as a forced call to a single `tuck_reply` function. The model wants to call a tool, so it gets exactly one.
- Fail fast on rate limits instead of retrying.
- Fall back to `gpt-oss-120b`, which has its own rate-limit bucket.

Every error now shows an in-character line, like *"Phew, I need a quick breather. One minute?"*, with a **Try again** button.

**Designing for a free tier.** Groq's free tier for gpt-oss-20b is 8,000 tokens a minute, shared by everyone using the app. That shaped the product:
- **Short goals instead of long tutoring answers.**
- **A slim prompt** of about 900 tokens.
- **Reuse:** the goal Tuck suggests at the check-in becomes your next Start with no extra call.
- **No AI where none is needed:** timer lines and reactions stay local.

## Why Does Open Innovation Matter?

<!-- Rewrite in your own voice; these are the points I'd make. -->

- **I'm not locked in.** gpt-oss-20b is open-weight under Apache 2.0. Today Groq serves it fast and free. The same code can point at any OpenAI-compatible server with one environment variable, `AI_BASE_URL`, including Ollama or LM Studio on your own laptop. *(I haven't tested a local server yet.)* For a focus app, that means your tasks could stay on your own machine.
- **Swapping models is a config change, not a rewrite.** Moving between gpt-oss-20b and gpt-oss-120b, as a rate-limit fallback, needed no code changes.
- **Open weights come with open documentation.** When the model did something surprising (trying to call a tool), I could read how it formats responses and design around it, instead of guessing at a black box.
- **Where open beat closed for me:** cost and control. A small open model on a free tier, with a tight prompt and a strict schema, is all a focus partner needs. I don't need the biggest closed model to say "Draft the intro paragraph. Just that."

## The Lazy Payoff

You type four words. Tuck does the planning, picks the one thing worth doing in the next 25 minutes, and checks on you afterward. Slow and steady: one small goal at a time, no to-do list required.

<!-- Prize Categories: none entered. -->
