import { NativeModule, requireNativeModule } from 'expo';

type Events = { onAction: () => void };

// android/…/ErekWidgetsModule.kt — the native home-screen widgets (src/widget/nativeWidgets.ts).
declare class ErekWidgetsModule extends NativeModule<Events> {
  setBoard(json: string): void;
  consumePending(): string;
  patchHabit(habitId: string, day: string, completed: boolean, amount: number): void;
  importPicks(json: string): void;
}

export default requireNativeModule<ErekWidgetsModule>('ErekWidgets');
