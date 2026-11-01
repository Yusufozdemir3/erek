import { NativeModule, requireNativeModule } from 'expo';

export interface TimerNotificationOptions {
  channelName: string;
  title: string;
  kind: string;
  id: string;
  running: boolean;
  // false: notifications are off — the state is kept (the timer widget shows
  // it) but no card is posted.
  notify: boolean;
  date: string;          // "YYYY-MM-DD" the session belongs to
  elapsedMs: number;     // the chronometer / frozen clock starts from here
  targetSeconds: number; // 0 without a target (the widget's progress bar)
  targetText: string;    // "30:00", or "" without a target
  runningText: string;   // plain text while running (accessibility, hidden content)
  pausedTextTemplate: string; // "Paused · {time}" — the native side fills the time
  pauseLabel: string;
  resumeLabel: string;
  finishLabel: string;
  openUri: string;
  // "#RRGGBB" — the app's current theme and the item's color
  card: string;
  textColor: string;
  primary: string;
  soft: string;
  onAccent: string;
  accent: string;
}

// A notification-button press the app hasn't booked yet. `at` is epoch ms.
export interface PendingTimerAction {
  op: 'pause' | 'resume' | 'finish';
  at: number;
  kind: string;
  id: string;
}

type Events = { onAction: () => void };

declare class TimerNotificationModule extends NativeModule<Events> {
  show(opts: TimerNotificationOptions): void;
  cancel(): void;
  consumePending(): string;
}

export default requireNativeModule<TimerNotificationModule>('TimerNotification');
