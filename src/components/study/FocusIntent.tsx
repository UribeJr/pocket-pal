"use client";
import { copy } from "@/lib/copy";
import { usePomodoro } from "@/companion/pomodoro";
import { answerCheckin, startFocus, useChatStore } from "@/companion/conversation";

/**
 * The focus-partner loop under the clock: "what are you working on?" before a session, the goal Tuck
 * set while it runs, and "did you finish?" when it ends. One line at a time, so the timer stays the hero.
 */
export function FocusIntent() {
  const phase = usePomodoro((s) => s.phase);
  const status = usePomodoro((s) => s.status);
  const task = useChatStore((s) => s.task);
  const goal = useChatStore((s) => s.goal);
  const goalFor = useChatStore((s) => s.goalFor);
  const checkinOpen = useChatStore((s) => s.checkinOpen);
  const checking = useChatStore((s) => s.checking);

  if (checkinOpen && goal) {
    return (
      <div className="focus-intent fade-in" role="group" aria-label={copy.focus.checkinQuestion(goal)} data-testid="checkin">
        <p className="text-[14px] text-[#3E3C38]">{copy.focus.checkinQuestion(goal)}</p>
        <div className="flex gap-2">
          <button type="button" className="chip" onClick={() => void answerCheckin("yes")} data-testid="checkin-yes">{copy.focus.yes}</button>
          <button type="button" className="chip" onClick={() => void answerCheckin("almost")} data-testid="checkin-almost">{copy.focus.almost}</button>
          <button type="button" className="chip" onClick={() => void answerCheckin("no")} data-testid="checkin-no">{copy.focus.notYet}</button>
        </div>
      </div>
    );
  }
  if (phase === "focus" && status === "ready") {
    const suggested = goal && goalFor === task.trim() ? goal : "";
    return (
      <form className="focus-intent" onSubmit={(e) => { e.preventDefault(); void startFocus(); }}>
        <input
          className="field !min-h-10 !rounded-full !py-2 text-center" value={task} maxLength={120}
          placeholder={copy.focus.taskPlaceholder} aria-label={copy.focus.taskLabel} data-testid="focus-task"
          onChange={(e) => useChatStore.setState({ task: e.target.value })}
        />
        {suggested && <p className="goal-line" data-testid="focus-goal">{copy.focus.next} · {suggested}</p>}
      </form>
    );
  }
  if (phase === "focus") {
    if (goal) return <p className="goal-line" data-testid="focus-goal">{copy.focus.goal} · {goal}</p>;
    return task.trim() ? <p className="goal-line text-mute">{copy.focus.settingGoal}</p> : null;
  }
  // a break: the next goal, once Tuck has suggested it
  if (goal && !checking) return <p className="goal-line" data-testid="focus-goal">{copy.focus.next} · {goal}</p>;
  return null;
}
