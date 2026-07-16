// Ana ekran widget'ının snapshot'ını ÜRETEN taraf (uygulama süreci).
// Bugüne planlı alışkanlıkları repo'dan okur, aktif tema/dil ile yerelleştirilmiş
// bir snapshot kurar, AsyncStorage'a yazar ve (varsa) native widget'ı tazeler.
//
// refreshWidget(userId) TAMAMEN kendine yeter: dil ve temayı AsyncStorage'dan
// kendisi okur (React context gerektirmez) — böylece herhangi bir yerden tek
// argümanla çağrılabilir (notifications.ts'in getStoredLang/translate deseni).
//
// EXPO GO GÜVENLİĞİ: react-native-android-widget yalnızca lazy require ile ve
// try/catch içinde yüklenir. Expo Go'da native modül yoktur; barrel import'u
// orada patlayabilir, bu yüzden snapshot her koşulda yazılır ama native güncelleme
// yalnızca gerçek build'de (Android) denenir.

import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { habitRepo } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import {
  ACCENT_THEMES,
  DEFAULT_ACCENT,
  DEFAULT_HABIT_COLOR,
  blackColors,
  darkColors,
  lightColors,
  fullDateLabel,
  type AccentKey,
} from '@/ui/theme';
import { WIDGET_NAME, writeSnapshot, type WidgetColors, type WidgetSnapshot } from './widgetSnapshot';

// ThemeProvider ile aynı AsyncStorage anahtarları — tema tercihini React dışından
// okumak için (bkz. src/ui/ThemeProvider.tsx).
const MODE_KEY = 'theme:mode';
const ACCENT_KEY = 'theme:accent';
const DARK_STYLE_KEY = 'theme:darkStyle';

// Aktif paleti React dışında çözer: kayıtlı mod + vurgu + koyu stil + sistem şeması.
async function resolveColors(): Promise<WidgetColors> {
  const [mode, accentRaw, darkStyle] = await Promise.all([
    AsyncStorage.getItem(MODE_KEY),
    AsyncStorage.getItem(ACCENT_KEY),
    AsyncStorage.getItem(DARK_STYLE_KEY),
  ]);
  const system = Appearance.getColorScheme(); // 'light' | 'dark' | null
  const scheme: 'light' | 'dark' =
    mode === 'dark' || mode === 'light' ? mode : system === 'dark' ? 'dark' : 'light';
  const base =
    scheme === 'dark' ? (darkStyle === 'black' ? blackColors : darkColors) : lightColors;
  const accent: AccentKey =
    accentRaw && accentRaw in ACCENT_THEMES ? (accentRaw as AccentKey) : DEFAULT_ACCENT;
  const primary = ACCENT_THEMES[accent][scheme].primary;
  return {
    bg: base.bg,
    card: base.card,
    text: base.text,
    muted: base.muted,
    faint: base.faint,
    primary,
    done: base.done,
    border: base.border,
    onAccent: base.onAccent,
  };
}

// Bugüne planlı (sıklık + yaşam aralığı) alışkanlıkların o günkü durumundan
// widget snapshot'ı kurar. useTodayData'daki filtre mantığının aynısı.
export async function buildTodaySnapshot(userId: string): Promise<WidgetSnapshot> {
  const lang = await getStoredLang();
  const colors = await resolveColors();
  const today = todayDate();

  const scheduled = habitRepo
    .listByUser(userId)
    .filter(
      (h) =>
        isScheduledOn(h.schedule, today) && isWithinHabitDates(h.start_date, h.end_date, today)
    );
  const dayStates = habitRepo.getDayStates(
    scheduled.map((h) => h.id),
    today
  );
  const habits = scheduled.map((h) => ({
    id: h.id,
    title: h.title,
    color: h.color ?? DEFAULT_HABIT_COLOR,
    completed: dayStates[h.id]?.completed ?? false,
  }));
  const doneCount = habits.filter((h) => h.completed).length;

  return {
    date: today,
    dateLabel: fullDateLabel(today, lang),
    title: translate(lang, 'widget.title'),
    summaryLabel: translate(lang, 'widget.summary', { done: doneCount, total: habits.length }),
    emptyLabel: translate(lang, 'widget.empty'),
    doneCount,
    totalCount: habits.length,
    habits,
    colors,
  };
}

// Snapshot'ı yazar ve (Android + gerçek build ise) native widget'ı yeniden çizer.
// Hata hiçbir koşulda uygulamayı bozmamalı: her adım savunmacı.
export async function refreshWidget(userId: string): Promise<void> {
  let snap: WidgetSnapshot;
  try {
    snap = await buildTodaySnapshot(userId);
  } catch {
    return; // veri okunamadı — widget'a dokunma
  }
  await writeSnapshot(snap).catch(() => {});

  if (Platform.OS !== 'android') return;
  try {
    // Lazy: paket yalnızca native modül varken (dev/prod build) yüklensin.
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const React = require('react');
    const { TodayWidget } = require('./TodayWidget');
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => React.createElement(TodayWidget, { snapshot: snap }),
      widgetNotFound: () => {},
    });
  } catch {
    // Expo Go ya da widget desteği yok — snapshot yazıldı, native güncelleme atlandı.
  }
}
