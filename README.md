*Other languages: [Türkçe](README.tr.md)*

# Habit App — Data Layer (Step 1)

The core of a task / goal / habit tracking app. This first step **contains no UI**; it sets up the offline-first data layer. Screens will be built on top of it.

## Architecture decisions

- **Offline-first.** Everything is written to the on-device SQLite database first. The app works fully without internet.
- **UI never sees SQL.** Screens only call repository functions (like `taskRepo.create()`). This means changing the database later won't break the UI.
- **UUID identifiers.** IDs are generated on-device, so records created while offline never collide with cloud records.
- **Last write wins + soft delete.** Every record has `updated_at` (for conflict resolution) and `deleted_at` (deleted records are marked, not actually removed). This lets us add cloud sync later without friction.
- **Streaks aren't stored, they're computed.** The streak count is always derived from habit logs — the logs are the single source of truth.

## Folder structure

```
src/
  types/models.ts              All data types
  lib/helpers.ts               UUID, date, JSON helpers
  db/
    database.ts                Connection + migration runner
    index.ts                   Single entry point for the data layer
    migrations/001_initial.ts  Schema (all tables)
    repositories/
      userRepo.ts               Anonymous start + upgrade to account
      taskRepo.ts                Tasks (due date, priority, recurrence)
      habitRepo.ts                Habits + streak calculation
      goalRepo.ts                 Goals (numeric + date-based)
```

## Setup

```bash
npm install
npm run typecheck   # type checking
npm start           # starts Expo (open on your phone with Expo Go)
```

> Note: `expo-sqlite` and `expo-crypto` work on real devices/emulators; SQLite is limited in the web preview.

## Usage example

```ts
import { initDataLayer, taskRepo, habitRepo } from '@/db';

const { user } = await initDataLayer();

// Add a task
taskRepo.create({ user_id: user.id, title: 'Finish the presentation', priority: 'high', due_date: '2026-07-01' });

// Add a habit and check it off for today
const habit = habitRepo.create({ user_id: user.id, title: 'Drink water', remind_at: '09:00' });
habitRepo.toggleLog(habit.id, '2026-06-28', true);
console.log(habitRepo.currentStreak(habit.id)); // 1
```

## Next step

The "Today" screen + task module UI. Since the data layer is ready, screens will call the repositories directly.
