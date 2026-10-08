// When "Take today off" is offered from the Today screen's habit menu: only for
// today (a past day is history, a future one hasn't happened), and only before
// the habit was started — a ticked, counted or running habit isn't a rest day.
// The habit stats screen applies the same rule (RestDayButton).

export function restDayOffered(p: {
  viewingToday: boolean;
  completed: boolean;
  amount: number;
  timerRunning: boolean;
}): boolean {
  return p.viewingToday && !p.completed && p.amount === 0 && !p.timerRunning;
}
