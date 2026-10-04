// Guides (modal, opened from the Profile menu): every feature guide in one list,
// so a guide can be read again any time — and so the ones that have no screen of
// their own (Widgets) can be found at all. A small "New" tag marks guides the
// person has not opened yet.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { GUIDE_IDS, hasSeenGuide, markGuideSeen, type GuideId } from '@/lib/guides';
import { useAppData } from '@/ui/AppData';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

const ICONS: Record<GuideId, keyof typeof Feather.glyphMap> = {
  today: 'home',
  habits: 'repeat',
  tasks: 'check-square',
  goals: 'target',
  friends: 'users',
  widgets: 'grid',
  notifications: 'bell',
};

// The order people meet the features in.
const ORDER: GuideId[] = ['today', 'habits', 'tasks', 'goals', 'friends', 'widgets', 'notifications'];

export default function GuidesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { authUser } = useAppData();
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<GuideId | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all(GUIDE_IDS.map(async (id) => [id, await hasSeenGuide(id)] as const)).then((rows) => {
      if (alive) setSeen(Object.fromEntries(rows));
    });
    return () => {
      alive = false;
    };
  }, []);

  const close = () => {
    if (open) {
      markGuideSeen(open);
      setSeen((s) => ({ ...s, [open]: true }));
    }
    setOpen(null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{t('guides.subtitle')}</Text>
      {ORDER.filter((id) => GUIDE_IDS.includes(id)).map((id) => (
        <Pressable
          key={id}
          style={styles.row}
          onPress={() => setOpen(id)}
          accessibilityRole="button"
          accessibilityLabel={t('guides.openA11y', { title: t(`guides.item.${id}`) })}
        >
          <Feather name={ICONS[id]} size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t(`guides.item.${id}`)}</Text>
            <Text style={styles.desc}>{t(`guides.desc.${id}`)}</Text>
          </View>
          {seen[id] === false && <Text style={styles.badge}>{t('guides.new')}</Text>}
          <Feather name="chevron-right" size={20} color={colors.faint} />
        </Pressable>
      ))}
      {open && (
        <FeatureGuide guide={open} visible onClose={close} canShare={!!authUser && !authUser.isAnonymous} />
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    subtitle: { fontSize: 14, color: c.muted, marginBottom: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { fontSize: 16, fontWeight: '700', color: c.text },
    desc: { fontSize: 12, color: c.muted, marginTop: 2 },
    badge: {
      fontSize: 11,
      fontWeight: '800',
      color: c.onAccent,
      backgroundColor: c.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      overflow: 'hidden',
    },
  });
