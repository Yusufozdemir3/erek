// The subtask section of the task edit modal. Each row: a drag handle (hold and
// drag to reorder), a 44px tick target, the title (tap it to rename) and a
// delete cross on the far side, away from the tick. The add box takes a pasted
// block: every line becomes its own subtask. Presentational only — the modal
// owns the repo calls. Drag is PanResponder + Animated (no gesture-handler
// native dependency), rows have a fixed height so the drop slot is plain
// arithmetic.

import { useRef, useState, type ComponentRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import type { Subtask } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { useRevealInModal } from '@/ui/ModalCard';
import { splitSubtaskLines } from '@/ui/subtaskActions';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

const ROW = 48;

interface Props {
  items: Subtask[];
  tickerNames: Map<string, string>;
  onToggle: (s: Subtask) => void;
  onRemove: (s: Subtask) => void;
  onRename: (s: Subtask, title: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAdd: (titles: string[]) => void;
}

export function SubtaskEditor({ items, tickerNames, onToggle, onRemove, onRename, onReorder, onAdd }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [draft, setDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  // Drag state: the row being moved and the slot it currently hovers over.
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const overRef = useRef(0);
  const reveal = useRevealInModal();
  const addRowRef = useRef<ComponentRef<typeof View>>(null);
  const renameRowRef = useRef<ComponentRef<typeof View>>(null);

  const slotFor = (from: number, delta: number) =>
    Math.max(0, Math.min(items.length - 1, from + Math.round(delta / ROW)));

  const onDragStart = (from: number) => {
    dy.setValue(0);
    overRef.current = from;
    setDrag({ from, over: from });
  };
  const onDragMove = (from: number, delta: number) => {
    dy.setValue(delta);
    const over = slotFor(from, delta);
    if (over !== overRef.current) {
      overRef.current = over;
      setDrag({ from, over });
    }
  };
  const onDragEnd = (from: number, delta: number) => {
    const over = slotFor(from, delta);
    setDrag(null);
    dy.setValue(0);
    if (over === from) return;
    const ids = items.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(over, 0, moved);
    onReorder(ids);
  };

  const shiftOf = (i: number): number => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -ROW;
    if (drag.from > drag.over && i < drag.from && i >= drag.over) return ROW;
    return 0;
  };

  const startRename = (s: Subtask) => {
    setRenamingId(s.id);
    setRenameText(s.title);
  };
  const commitRename = (s: Subtask) => {
    const title = renameText.trim().slice(0, TITLE_MAX_LEN);
    setRenamingId(null);
    // An emptied title keeps the old one (deleting is the cross's job).
    if (title && title !== s.title) onRename(s, title);
  };

  const submitDraft = () => {
    const titles = splitSubtaskLines(draft).map((l) => l.slice(0, TITLE_MAX_LEN));
    if (titles.length === 0) return;
    onAdd(titles);
    setDraft('');
  };

  return (
    <View>
      <Text style={styles.label}>{t('task.subtasks')}</Text>
      {items.map((s, i) => {
        const done = s.completed === 1;
        const by = done && s.completed_by ? tickerNames.get(s.completed_by) : undefined;
        const dragging = drag?.from === i;
        return (
          <Animated.View
            key={s.id}
            style={[
              styles.row,
              { transform: [{ translateY: dragging ? dy : shiftOf(i) }] },
              dragging && styles.rowDragging,
            ]}
          >
            <DragHandle
              index={i}
              onStart={onDragStart}
              onMove={onDragMove}
              onEnd={onDragEnd}
              label={t('task.reorderSubtaskA11y', { title: s.title })}
              color={colors.faint}
            />
            <Pressable
              style={styles.tick}
              onPress={() => onToggle(s)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={s.title}
            >
              <View style={[styles.box, done && styles.boxDone]}>
                {done && <Feather name="check" size={14} color={colors.onAccent} />}
              </View>
            </Pressable>
            {renamingId === s.id ? (
              <TextInput
                ref={renameRowRef as never}
                onFocus={() => reveal(renameRowRef.current)}
                style={styles.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                onBlur={() => commitRename(s)}
                onSubmitEditing={() => commitRename(s)}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                maxLength={TITLE_MAX_LEN}
                accessibilityLabel={t('task.renameSubtaskA11y', { title: s.title })}
              />
            ) : (
              <Pressable
                style={styles.titleHit}
                onPress={() => startRename(s)}
                accessibilityRole="button"
                accessibilityLabel={t('task.renameSubtaskA11y', { title: s.title })}
              >
                <Text style={[styles.title, done && styles.titleDone]} numberOfLines={1}>
                  {s.title}
                  {by ? <Text style={styles.by}> · {t('sharedTask.tickedBy', { name: by })}</Text> : null}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={styles.remove}
              onPress={() => onRemove(s)}
              accessibilityRole="button"
              accessibilityLabel={t('task.removeSubtaskA11y', { title: s.title })}
            >
              <Feather name="x" size={18} color={colors.faint} />
            </Pressable>
          </Animated.View>
        );
      })}
      <View ref={addRowRef} style={styles.addRow}>
        <TextInput
          onFocus={() => reveal(addRowRef.current)}
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('task.addSubtask')}
          placeholderTextColor={colors.faint}
          multiline
          // No maxLength: a pasted list is longer than one title; each line is cut on adding.
        />
        <Pressable
          style={styles.addBtn}
          onPress={submitDraft}
          accessibilityRole="button"
          accessibilityLabel={t('task.addSubtask')}
        >
          <Feather name="plus" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <Text style={styles.hint}>{t('task.subtaskHint')}</Text>
    </View>
  );
}

interface HandleProps {
  index: number;
  onStart: (index: number) => void;
  onMove: (index: number, dy: number) => void;
  onEnd: (index: number, dy: number) => void;
  label: string;
  color: string;
}

// Owns its PanResponder (created once), so the callbacks are read through a ref.
// It refuses to give the gesture back, so the modal's ScrollView doesn't scroll
// while a row is being dragged.
function DragHandle({ index, onStart, onMove, onEnd, label, color }: HandleProps) {
  const cb = useRef({ index, onStart, onMove, onEnd });
  cb.current = { index, onStart, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => cb.current.onStart(cb.current.index),
      onPanResponderMove: (_e, g) => cb.current.onMove(cb.current.index, g.dy),
      onPanResponderRelease: (_e, g) => cb.current.onEnd(cb.current.index, g.dy),
      onPanResponderTerminate: (_e, g) => cb.current.onEnd(cb.current.index, g.dy),
    })
  ).current;
  return (
    <View
      {...pan.panHandlers}
      style={handleStyles.handle}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
    >
      <Ionicons name="reorder-two-outline" size={24} color={color} />
    </View>
  );
}

const handleStyles = StyleSheet.create({
  handle: { width: 28, height: ROW, alignItems: 'center', justifyContent: 'center' },
});

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 4, marginTop: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.card,
    },
    rowDragging: { zIndex: 2, elevation: 4, borderRadius: 8, borderTopWidth: 0 },
    // 44px tick target around the 24px circle.
    tick: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    box: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxDone: { backgroundColor: c.done, borderColor: c.done },
    titleHit: { flex: 1, height: ROW, justifyContent: 'center', paddingHorizontal: 4 },
    title: { fontSize: 15, fontWeight: '500', color: c.text },
    titleDone: { color: c.faint, fontWeight: '400', textDecorationLine: 'line-through' },
    by: { fontSize: 11, color: c.faint, fontWeight: '400' },
    renameInput: {
      flex: 1,
      height: 40,
      marginHorizontal: 4,
      paddingHorizontal: 10,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    addRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'stretch' },
    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 140,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      textAlignVertical: 'top',
    },
    addBtn: {
      width: 48,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hint: { fontSize: 12, color: c.faint, marginTop: 6, marginBottom: 12 },
  });
