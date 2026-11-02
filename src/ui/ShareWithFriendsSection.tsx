// "Share with friends" card, shared by the owner's habit screen (read-only
// share, see src/sync/sharedHabits.ts) and goal screen (view + contribute, see
// src/sync/sharedGoals.ts). Each connected friend is a toggle chip. Hidden
// entirely without a signed-in account. Every network call is caught (no error
// boundary: an uncaught rejection would close the app in a release build).

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ACCOUNTS_ENABLED } from '@/config';
import {
  getCachedFriends,
  listConnections,
  sharingErrorKey,
  toSharingError,
  type Friend,
  type SharingErrorCode,
} from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

export interface ShareWithFriendsProps {
  entityId: string;
  hint: string;
  listShares: (id: string) => Promise<string[]>;
  share: (id: string, friendId: string) => Promise<void>;
  unshare: (id: string, friendId: string) => Promise<void>;
  // The server's answer when the entity was created offline and isn't in the
  // cloud yet: we push it (sync) and retry once.
  notSyncedCode: SharingErrorCode;
  // Shown between the hint and the friend chips (the habit card's mode switch).
  header?: React.ReactNode;
  // Habits: each friend is shared in ONE mode. Only the friends in `active` mode show ticked;
  // one in the other mode is switched over by tapping (not unshared).
  modes?: {
    active: boolean;
    load: (id: string) => Promise<Record<string, boolean>>;
    assign: (id: string, friendId: string, together: boolean) => Promise<void>;
  };
}

export function ShareWithFriendsSection({
  entityId,
  hint,
  listShares,
  share,
  unshare,
  notSyncedCode,
  header,
  modes,
}: ShareWithFriendsProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { authUser, syncNow } = useAppData();
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set());
  const [modeMap, setModeMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      let active = true;
      getCachedFriends().then((c) => {
        if (active && c.length > 0) setFriends(c);
      });
      Promise.all([listConnections(), listShares(entityId), modes ? modes.load(entityId) : Promise.resolve({})])
        .then(([list, shares, modeRows]) => {
          if (!active) return;
          setFriends(list);
          setSharedWith(new Set(shares));
          setModeMap(modeRows);
          setOffline(false);
        })
        .catch(() => {
          if (active) setOffline(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [signedIn, entityId, listShares, modes?.load])
  );

  if (!signedIn) return null;

  const toggle = async (friend: Friend) => {
    if (busyId) return;
    const shared = sharedWith.has(friend.id);
    const mode = modeMap[friend.id] ?? true;
    const on = shared && (!modes || mode === modes.active);
    setBusyId(friend.id);
    try {
      if (shared && modes && mode !== modes.active) {
        // Already shared in the other mode: switch it, don't unshare.
        await modes.assign(entityId, friend.id, modes.active);
        setModeMap((prev) => ({ ...prev, [friend.id]: modes.active }));
        return;
      }
      if (on) {
        await unshare(entityId, friend.id);
      } else {
        try {
          await share(entityId, friend.id);
        } catch (e) {
          // Created offline, not in the cloud yet: push it, then retry once.
          if (toSharingError(e).code !== notSyncedCode) throw e;
          await syncNow();
          await share(entityId, friend.id);
        }
        if (modes) {
          await modes.assign(entityId, friend.id, modes.active);
          setModeMap((prev) => ({ ...prev, [friend.id]: modes.active }));
        }
      }
      setSharedWith((prev) => {
        const next = new Set(prev);
        if (on) next.delete(friend.id);
        else next.add(friend.id);
        return next;
      });
    } catch (e) {
      Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('share.habitSection')}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {header}
      {offline && <Text style={styles.warn}>{t('friends.err.ERK_NETWORK')}</Text>}
      {friends.length === 0 ? (
        loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Pressable onPress={() => router.push('/friends')} accessibilityRole="button">
            <Text style={styles.link}>{t('share.noFriends')}</Text>
          </Pressable>
        )
      ) : (
        <View style={styles.chips}>
          {friends.map((f) => {
            const shared = sharedWith.has(f.id);
            const other = !!modes && shared && (modeMap[f.id] ?? true) !== modes.active;
            const on = shared && !other;
            const name = f.displayName ?? t('friends.unknownName');
            return (
              <Pressable
                key={f.id}
                style={[styles.chip, on && styles.chipOn, busyId === f.id && styles.chipBusy]}
                onPress={() => toggle(f)}
                disabled={busyId !== null || offline}
                accessibilityRole="switch"
                accessibilityState={{ checked: on, disabled: busyId !== null || offline }}
                accessibilityLabel={t('share.withA11y', { name })}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {on ? '✓ ' : ''}
                  {name}
                  {other ? ` · ${t(modes!.active ? 'group.modeNowView' : 'group.modeNowTogether')}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      marginTop: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    title: { fontSize: 13, color: c.muted, fontWeight: '600' },
    hint: { fontSize: 12, color: c.faint, lineHeight: 17, marginTop: 6, marginBottom: 12 },
    warn: { fontSize: 12, color: c.danger, fontWeight: '600', marginBottom: 10 },
    link: { fontSize: 14, color: c.primary, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
      maxWidth: '100%',
    },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipBusy: { opacity: 0.5 },
    chipText: { fontSize: 13, fontWeight: '600', color: c.muted },
    chipTextOn: { color: c.onAccent },
  });
