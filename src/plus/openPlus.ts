// Ways into the Plus screen from a locked feature.

import { Alert } from 'react-native';
import { router, type Href } from 'expo-router';

export type LockedFeature = 'history' | 'reminders' | 'friends';

export function openPlus(): void {
  router.push('/plus' as Href);
}

// Explains what is locked, with a way to see Plus (or to back out).
export function promptPlus(feature: LockedFeature, t: (key: string) => string): void {
  Alert.alert(t('plus.title'), t(`plus.lock.${feature}`), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('plus.see'), onPress: openPlus },
  ]);
}
