// Widget'ın arka plan (headless) görev işleyicisi. Android widget olayları
// (eklendi/güncelle/yeniden boyutlandı) tetiklendiğinde çalışır; AsyncStorage'daki
// hazır snapshot'ı okuyup widget'ı çizer. SQLite'a DOKUNMAZ (headless bağlamda
// güvenilir değil) — snapshot'ı uygulama süreci (widgetData.refreshWidget) üretir.
//
// index.js'te YALNIZCA gerçek build'de (native modül varken) kaydedilir.

import * as React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { TodayWidget } from './TodayWidget';
import { readSnapshot } from './widgetSnapshot';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await readSnapshot();
      props.renderWidget(<TodayWidget snapshot={snapshot} />);
      break;
    }
    // WIDGET_CLICK: kök 'OPEN_APP' tıklaması uygulamayı native tarafta açar,
    // işleyiciye düşmez. WIDGET_DELETED: yapılacak bir şey yok.
    default:
      break;
  }
}
