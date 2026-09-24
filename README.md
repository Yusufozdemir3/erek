*Other languages: [Türkçe](README.tr.md)*

# Erek

Erek is an offline-first habit, task and goal tracker built with Expo and React Native. Track habits, tasks and goals — no account required, no tracking, no data ever sold.

## Features

- **Habits** — three types: simple (done/not done), numeric (daily amount, e.g. 8 glasses of water) and timer-based (e.g. 20 minutes of meditation). Set the frequency (daily, specific weekdays, every X days, X times a week), give each habit an icon and a colour.
- **Streaks & badges** — streaks are always computed from habit logs, never stored. Badges at 7, 30, 100 and 365 days.
- **Statistics** — per-habit score chart, period targets (today/week/month/quarter/year), monthly calendar, and history chart for numeric/timer habits.
- **Tasks** — priority, due date and time, subtasks, and recurring tasks that automatically roll to their next due date on completion.
- **Goals** — numeric goals (e.g. read 200 pages) or milestone lists, with pace/ETA projections. A habit can be linked to a goal so completing it advances the goal automatically.
- **Reminders** — local notifications for habits, tasks and goals, with configurable sound and vibration.
- **Home screen widget** — Android widget showing today's tasks and habits.
- **Ads** — a full-screen (interstitial) AdMob ad, shown at most once every 30 minutes when the app returns to the foreground, and never right after onboarding/first install or right after completing a habit/task.
- **Appearance** — light, dark (two tones) and system theme, with a selectable accent colour.
- **Languages** — Turkish, English and German.
- **Optional cloud sync** — sign in with Google to back up and sync data across devices via Supabase; fully optional, and the account (with all cloud data) can be permanently deleted from within the app.

## Architecture decisions

- **Offline-first.** Everything is written to the on-device SQLite database first. The app works fully without internet.
- **UI never sees SQL.** Screens only call repository functions (like `taskRepo.create()`). This means changing the database later won't break the UI.
- **UUID identifiers.** IDs are generated on-device, so records created while offline never collide with cloud records.
- **Last write wins + soft delete.** Every record has `updated_at` (for conflict resolution) and `deleted_at` (deleted records are marked, not actually removed), which is what makes cloud sync possible.
- **Streaks aren't stored, they're computed.** The streak count is always derived from habit logs — the logs are the single source of truth.

## Tech stack

- [Expo](https://expo.dev) / React Native, with [expo-router](https://docs.expo.dev/router/introduction/) for file-based navigation
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for the local, offline-first database
- [Supabase](https://supabase.com) for optional account-based cloud sync (see `supabase/schema.sql`)
- TypeScript throughout
- Jest for tests, split into a `logic` project (data layer, sync, i18n) and a `ui` project (React Native components)

## Folder structure

```
app/                          Screens & navigation (expo-router)
src/
  types/models.ts              All data types
  lib/                          Shared helpers (dates, sentry, ads, etc.)
  db/
    database.ts                Connection + migration runner
    index.ts                   Single entry point for the data layer
    migrations/                 Schema migrations
    repositories/               task/habit/goal/reminder/subtask/user repos
  sync/                         Optional Supabase cloud sync engine
  i18n/                         Turkish / English / German translations
  ui/                           Screens' building blocks (forms, charts, modals…)
  widget/                       Android home screen widget
  web/                          Web-only stubs for native-only modules
modules/                       Custom native Expo module (notification channels)
plugins/                       Expo config plugins
supabase/schema.sql            Cloud database schema
docs/                          Store listing, privacy policy, setup guides
```

## Setup

```bash
npm install
cp .env.example .env   # optional: fill in Supabase / Google sign-in / Sentry / AdMob keys
npm run typecheck      # type checking
npm test                # run all tests
npm start               # starts Expo (open on your phone with Expo Go, or run android/ios)
```

The app works fully without any `.env` values — cloud sync, Google sign-in and crash reporting are all optional and stay disabled until configured. Ads work out of the box using Google's test ad unit (no revenue); set `EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID` in `.env` to use a real one. See `.env.example` for what each variable does.

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

## Documentation

- `docs/store-listing.md` — app store copy (source of truth for feature descriptions)
- `docs/privacy-policy.md` — privacy policy
- `docs/google-signin-setup.md` — Google sign-in setup
- `docs/sharing-design.md` — sharing feature design notes
