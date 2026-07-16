// Ana ekran widget'ının GÖRÜNÜMÜ. react-native-android-widget'ın kendi
// bileşenleriyle (FlexWidget/TextWidget) çizilir — RN View/StyleSheet DEĞİL;
// bu bileşenler Android RemoteViews'e dönüştürülür. Renkler/veri snapshot'tan
// gelir (bkz. widgetSnapshot.ts). Tüm karta OPEN_APP tıklaması bağlıdır: widget'a
// dokununca uygulama açılır (varsayılan rota = Bugün sekmesi).
//
// ÖNEMLİ: Bu dosya react-native-android-widget'ı import eder; o paketin barrel'ı
// Expo Go'da native modül yokken yüklenmemeli. Bu yüzden TodayWidget yalnızca
// gerçek build'de (widgetData'daki lazy require + headless task handler)
// yüklenir; uygulamanın normal ekran ağacından ASLA import edilmez.

import * as React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from './widgetSnapshot';

// Kütüphane renkleri `#rrggbb` şablon tipinde ister; palet düz string tuttuğu için
// tek noktadan güvenle daraltıyoruz.
const hex = (s: string) => s as `#${string}`;

// Widget'a sığması için en çok kaç satır gösterilsin; fazlası "+N" olarak özetlenir.
const MAX_ROWS = 7;

// Uygulama hiç açılmadan widget eklenirse (snapshot yok) kullanılacak açık tema.
const FALLBACK: WidgetSnapshot['colors'] = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  primary: '#2f5d45',
  done: '#10b981',
  border: '#e2e8f0',
  onAccent: '#ffffff',
};

export function TodayWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const c = snapshot?.colors ?? FALLBACK;
  const habits = snapshot?.habits ?? [];
  const visible = habits.slice(0, MAX_ROWS);
  const overflow = habits.length - visible.length;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(c.bg),
        borderRadius: 16,
        padding: 14,
      }}
    >
      {/* Başlık + özet */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TextWidget
          text={snapshot?.title ?? 'Erek'}
          style={{ fontSize: 16, fontWeight: '700', color: hex(c.text) }}
        />
        {snapshot && snapshot.totalCount > 0 ? (
          <TextWidget
            text={snapshot.summaryLabel}
            style={{ fontSize: 13, fontWeight: '600', color: hex(c.primary) }}
          />
        ) : (
          <TextWidget text="" style={{ fontSize: 13, color: hex(c.faint) }} />
        )}
      </FlexWidget>

      {/* Liste ya da boş durum */}
      {visible.length === 0 ? (
        <TextWidget
          text={snapshot?.emptyLabel ?? ''}
          style={{ fontSize: 13, color: hex(c.muted), marginTop: 12 }}
        />
      ) : (
        visible.map((h) => (
          <FlexWidget
            key={h.id}
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            {/* Renk noktası (alışkanlığın rengi) */}
            <FlexWidget
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex(h.color) }}
            />
            {/* Başlık — kalan alanı kaplar, taşınca kısaltılır */}
            <FlexWidget style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
              <TextWidget
                text={h.title}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 14, color: h.completed ? hex(c.faint) : hex(c.text) }}
              />
            </FlexWidget>
            {/* Durum işareti */}
            <TextWidget
              text={h.completed ? '✓' : '○'}
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: h.completed ? hex(c.done) : hex(c.faint),
              }}
            />
          </FlexWidget>
        ))
      )}

      {overflow > 0 ? (
        <TextWidget text={`+${overflow}`} style={{ fontSize: 12, color: hex(c.muted), marginTop: 8 }} />
      ) : (
        <FlexWidget style={{ width: 0, height: 0 }} />
      )}
    </FlexWidget>
  );
}
