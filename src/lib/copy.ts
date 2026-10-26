/**
 * Every user-facing string of the study experience, in one place for review before release.
 * Tuck's lines stay short, warm and lowercase; interface labels are plain and calm.
 */
export const copy = {
  app: { name: "Pocket Pal", tagline: "Focus with Tuck", description: "Focus alongside Tuck, a tiny acorn who turns your task into one small goal and checks in when the timer ends." },

  /** the focus-partner loop: intention at Start, goal during focus, "did you finish?" at the break */
  focus: {
    taskPlaceholder: "What are you working on?",
    taskLabel: "What are you working on? Tuck turns it into one goal for this session",
    settingGoal: "Tuck is picking a goal…",
    goal: "Goal",
    next: "Next",
    checkinQuestion: (goal: string) => `Did you finish: ${goal}?`,
    yes: "Yes", almost: "Almost", notYet: "Not yet",
    /** Tuck's caption the moment you answer, so it always matches your choice */
    checkinCaption: { yes: "Yes! You did it!", almost: "So close! Nice push.", no: "That's okay. Let's make it smaller." },
  },

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
    /** session end when there's a goal to check: no verdict before the user answers */
    timeUp: ["Time's up! How did it go?", "That's the timer. How did it go?"],
    cycleDone: ["four sessions! that's a real streak.", "a whole cycle. take a proper break."],
    breakOver: ["ready when you are.", "back to it?"],
  },

  ask: {
    entry: "Ask Tuck…",
    entryLabel: "Ask Tuck for help focusing",
    title: "Ask Tuck",
    close: "Close Ask Tuck",
    placeholder: "Tell Tuck what's up…",
    thinking: "Tuck is thinking…",
    send: "Send",
    empty: "Stuck, distracted, or need a plan? I'm right here.",
    chips: [
      { label: "Plan this session", prompt: "Help me plan this focus session." },
      { label: "I'm stuck", prompt: "I'm stuck." },
      { label: "I'm distracted", prompt: "I'm distracted." },
      { label: "Quiz me", prompt: "Quiz me on what I'm working on. One question." },
    ],
    visitOnly: "This conversation isn't saved after you leave.",
    failure: "Oops, Tuck lost his train of thought.",
    notConnected: "Tuck's brain is napping. Try again in a minute.",
    offline: "You're offline, so Tuck can't think that through yet.",
    rateLimited: "Phew, Tuck needs a quick breather. Try again in a minute.",
    retry: "Try again",
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
