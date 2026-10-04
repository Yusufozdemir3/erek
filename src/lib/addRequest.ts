// "Open the add form" requests from outside the screen tree — the quick-add
// widget's deep link lands on app/(tabs)/add.tsx, which asks here; the tab
// layout (which owns the add sheet) answers.
//
// The route can mount BEFORE the layout has subscribed (a cold start from the
// widget), so a request with no listener is kept and handed over on subscribe.

import type { Step } from '@/ui/AddSheet';

type Listener = (step: Step) => void;

const listeners = new Set<Listener>();
let pending: Step | null = null;

export function requestAdd(step: Step): void {
  if (listeners.size === 0) {
    pending = step;
    return;
  }
  listeners.forEach((l) => l(step));
}

export function onAddRequest(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const step = pending;
    pending = null;
    listener(step);
  }
  return () => {
    listeners.delete(listener);
  };
}

const STEPS: readonly Step[] = ['menu', 'task', 'habit', 'goal'];

// The `step` query of habitapp://add?step=task; anything unknown opens the menu.
export function parseAddStep(value: string | string[] | undefined): Step {
  const v = Array.isArray(value) ? value[0] : value;
  return STEPS.find((s) => s === v) ?? 'menu';
}
