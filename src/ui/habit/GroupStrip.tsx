// A shared habit's members under the card title: one small circle per member
// (filled green + tick = marked, dashed = waiting, faint = rest day), then who
// is still missing ("Mert is waited for") or "Everyone's done", and the shared
// streak on its own line.

import { StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import type { GroupDayStatus } from '@/lib/habitGroup';
import type { HabitGroupMember } from '@/sync';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

export function memberName(m: HabitGroupMember, t: (k: string) => string): string {
  if (m.isMe) return t('group.you');
  return m.displayName ?? t('friends.unknownName');
}

export function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toLocaleUpperCase();
}

// "Mert bekleniyor" / "3 kişi bekleniyor" / "Herkes tamam".
function useWaitingLabel(status: GroupDayStatus): string {
  const { t } = useI18n();
  const waiting = status.members.filter((m) => m.state === 'waiting').map((m) => memberName(m.member, t));
  if (status.allDone) return t('group.allDone');
  if (waiting.length === 1) return t('group.waitingOne', { name: waiting[0] });
  return t('group.waitingMany', { n: waiting.length });
}

interface Props {
  status: GroupDayStatus;
  // The shared streak, shown on its own line under the circles (omit to hide it).
  streak?: number;
}

export function GroupStrip({ status, streak }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const label = useWaitingLabel(status);

  return (
    <View accessible accessibilityLabel={label}>
      <View style={styles.row}>
        {status.members.map(({ member, state }) => (
          <View key={member.id} style={[styles.dot, state === 'waiting' && styles.dotWaiting, state === 'rest' && styles.dotRest]}>
            <Text style={styles.initial}>{initialOf(memberName(member, t))}</Text>
            {state === 'done' && (
              <View style={styles.tick}>
                <Feather name="check" size={9} color={colors.onAccent} />
              </View>
            )}
          </View>
        ))}
        <Text style={[styles.label, status.allDone && styles.labelDone]} numberOfLines={1}>
          {status.allDone ? label : `${status.done}/${status.total} · ${label}`}
        </Text>
      </View>
      {streak !== undefined && streak > 0 && (
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={14} color={colors.streak} />
          <Text style={styles.streakText}>{t('group.streakLine', { n: streak })}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    dot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    dotWaiting: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line },
    dotRest: { opacity: 0.35 },
    initial: { fontSize: 10, fontWeight: '700', color: c.primary },
    tick: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor: c.done,
      borderWidth: 1.5,
      borderColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { flex: 1, fontSize: 12, color: c.muted, marginLeft: 2 },
    labelDone: { color: c.done, fontWeight: '600' },
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    streakText: { fontSize: 12, color: c.muted },
  });
