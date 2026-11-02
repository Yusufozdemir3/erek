// Notifications inbox (the bell next to the profile photo): congratulations,
// finished notices and nudges from friends in the last 30 days, so they stay
// readable after the system notification is gone. Newest first; rows that were
// unread when the screen opened carry a dot. A tap opens the item when it still
// exists here. Cache first, then the server (src/ui/useInbox.ts).

import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { goalRepo, habitRepo } from '@/db';
import { inboxRoute, inboxTextKey, type InboxItem } from '@/lib/inbox';
import { EmptyState } from '@/ui/EmptyState';
import { markInboxSeen, refreshInbox, useInbox } from '@/ui/useInbox';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { dateTimeLabel, type Colors } from '@/ui/theme';

const ICONS: Record<InboxItem['type'], keyof typeof Feather.glyphMap> = {
  congrats: 'award',
  finished: 'flag',
  nudge: 'bell',
  invite: 'user-plus',
  group_done: 'users',
};

export default function InboxScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { signedIn, items, seenAt, loaded } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  // "Unread" as it was when the screen opened; opening marks everything read.
  const openedSeenAt = useRef<string | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (openedSeenAt.current === undefined) openedSeenAt.current = seenAt;
      refreshInbox(true).then(markInboxSeen);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    refreshInbox(true)
      .then(markInboxSeen)
      .finally(() => setRefreshing(false));
  };

  const isUnread = (i: InboxItem) => {
    const s = openedSeenAt.current;
    return s == null ? true : Date.parse(i.createdAt) > Date.parse(s);
  };

  const open = (i: InboxItem) => {
    const route = inboxRoute(i);
    if (!route) return;
    // Congratulations and nudges are about my item: only if it's still here.
    if (i.type !== 'finished') {
      const mine = i.kind === 'habit' ? habitRepo.getById(i.itemId) : goalRepo.getById(i.itemId);
      if (!mine) return;
    }
    router.push(route as Href);
  };

  if (!signedIn) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="bell" title={t('inbox.signedOut')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      {items.length === 0 ? (
        loaded && <EmptyState icon="bell" title={t('inbox.emptyTitle')} subtitle={t('inbox.emptyBody')} />
      ) : (
        items.map((i) => {
          const name = i.senderName ?? t('friends.unknownName');
          const title = i.itemTitle ?? t('inbox.deletedItem');
          const tappable = inboxRoute(i) != null;
          return (
            <Pressable
              key={i.id}
              style={styles.row}
              onPress={() => open(i)}
              disabled={!tappable}
              accessibilityRole={tappable ? 'button' : 'text'}
            >
              <View style={styles.icon}>
                <Feather name={ICONS[i.type]} size={18} color={colors.primary} />
              </View>
              <View style={styles.body}>
                <Text style={styles.text}>{t(inboxTextKey(i), { name, title })}</Text>
                <Text style={styles.date}>{dateTimeLabel(i.createdAt, lang)}</Text>
              </View>
              {isUnread(i) && <View style={styles.unread} accessibilityLabel={t('inbox.unreadA11y')} />}
              {tappable && <Feather name="chevron-right" size={18} color={colors.faint} />}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    text: { fontSize: 15, color: c.text },
    date: { fontSize: 12, color: c.muted, marginTop: 3 },
    unread: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
  });
