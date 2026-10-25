/**
 * Every user-facing string of the study experience, in one place for review before release.
 * Tuck's lines stay short, warm and lowercase; interface labels are plain and calm.
 */
export const copy = {
  app: { name: "Pocket Pal", tagline: "Study with Tuck", description: "Study alongside Tuck, a tiny acorn who keeps you company while you focus." },

  phase: { focus: "Focus", short: "Short break", long: "Long break" },
  status: { ready: "Ready", paused: "Paused" },
  cycle: (n: number, of: number) => `${n} of ${of}`,
  doneToday: (n: number) => (n === 1 ? "1 session today" : `${n} sessions today`),

  controls: {
    start: "Start", startBreak: "Start break", pause: "Pause", resume: "Resume", reset: "Reset", skip: "Skip",
    startLabel: "Start the timer", pauseLabel: "Pause the timer", resumeLabel: "Resume the timer",
    resetLabel: "Reset to a full focus session", skipLabel: "Skip to the next phase",
    resetConfirm: "Reset this session?",
  },

  /** spoken by screen readers at phase changes only */
  announce: {
    focusStarted: (m: number) => `Focus started, ${m} minutes.`,
    breakStarted: (long: boolean, m: number) => `${long ? "Long" : "Short"} break, ${m} minutes.`,
    focusCompleted: "Focus session complete.",
    breakCompleted: "Break over. Ready when you are.",
    paused: "Timer paused.", resumed: "Timer resumed.", reset: "Timer reset.",
  },

  notify: {
    focusDone: { title: "Focus session done", body: "Nice work. Time for a break." },
    breakDone: { title: "Break's over", body: "Ready for another round?" },
  },

  /** Tuck's speech-bubble lines for timer moments (one is picked at random) */
  tuck: {
    focusStart: ["okay. let's focus.", "quiet mode. i'm right here.", "let's do this together."],
    focusDone: ["nice work.", "that's a whole session. proud of you.", "done! stretch a little?", "you did it."],
    cycleDone: ["four sessions! that's a real streak.", "a whole cycle. take a proper break."],
    breakOver: ["ready when you are.", "back to it?"],
  },

  ask: {
    entry: "Ask Tuck…",
    entryLabel: "Ask Tuck for study help",
    title: "Ask Tuck",
    close: "Close Ask Tuck",
    placeholder: "Ask about what you're studying…",
    thinking: "Tuck is thinking…",
    send: "Send",
    subject: "What are you studying?",
    subjectPlaceholder: "e.g. cell biology",
    empty: "I can explain a topic, plan your session, or quiz you.",
    chips: [
      { label: "Explain", prompt: "Can you explain " },
      { label: "Plan my session", prompt: "Help me plan this study session." },
      { label: "Quiz me", prompt: "Quiz me on what I'm studying, one question at a time." },
    ],
    visitOnly: "This conversation isn't saved after you leave.",
    failure: "I couldn't reach my notes just now. Try again in a moment.",
    notConnected: "Ask Tuck isn't connected yet. The study assistant needs its AI key on the server.",
    offline: "You're offline, so I can't look things up right now.",
    rateLimited: "That's a lot of questions for today. Let's pick this up later.",
  },

  settings: {
    open: "Settings", title: "Settings", close: "Close settings",
    timer: "Timer", focusMin: "Focus", shortMin: "Short break", longMin: "Long break", longEvery: "Long break after",
    sessions: "sessions", minutes: "min",
    autoStartBreaks: "Start breaks automatically", autoStartFocus: "Start focus automatically",
    alerts: "Alerts", notify: "Notify me when a phase ends", notifyHint: "Only while Pocket Pal is in the background.",
    notifyBlocked: "Notifications are blocked in this browser.", sound: "Soft chime",
    memory: "Memory", memoryOpen: "What Tuck remembers",
  },

  hint: { tap: "tap Tuck · hold to talk", sleeping: "tap to wake Tuck" },
} as const;

export const pickLine = (lines: readonly string[], r = Math.random) => lines[Math.floor(r() * lines.length) % lines.length];
