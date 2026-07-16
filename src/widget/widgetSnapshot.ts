// Ana ekran widget'ının OKUDUĞU anlık görüntü (snapshot) tipi ve AsyncStorage
// erişimi. Bu dosya BİLEREK hiçbir repo (expo-sqlite) import etmez: widget'ın
// arka plan (headless) görev işleyicisi buradan yalnızca hazır snapshot'ı okur —
// o bağlamda SQLite güvenilir değildir. Snapshot'ı ÜRETEN taraf (uygulama
// süreci) src/widget/widgetData.ts'tir.

import AsyncStorage from '@react-native-async-storage/async-storage';

// app.json'daki config plugin'de tanımlı widget adıyla BİREBİR aynı olmalı.
export const WIDGET_NAME = 'ErekToday';
export const SNAPSHOT_KEY = 'widget:today';

export interface WidgetHabit {
  id: string;
  title: string;
  color: string; // çözülmüş renk (alışkanlık rengi ya da varsayılan)
  completed: boolean;
}

// Widget'ın çizeceği renkler — snapshot'a gömülür ki headless işleyici
// uygulama açık olmasa da doğru tema (açık/koyu + vurgu) ile çizsin.
export interface WidgetColors {
  bg: string;
  card: string;
  text: string;
  muted: string;
  faint: string;
  primary: string;
  done: string;
  border: string;
  onAccent: string;
}

export interface WidgetSnapshot {
  date: string; // "YYYY-MM-DD" — snapshot yazıldığındaki bugün
  dateLabel: string; // yerelleştirilmiş tam tarih ("Çarşamba, 16 Temmuz 2026")
  title: string; // "Bugün" (yerelleştirilmiş)
  summaryLabel: string; // "3/5 tamamlandı" (yerelleştirilmiş)
  emptyLabel: string; // liste boşken gösterilecek yerelleştirilmiş metin
  doneCount: number;
  totalCount: number;
  habits: WidgetHabit[];
  colors: WidgetColors;
}

export async function writeSnapshot(s: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
}

export async function readSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}
