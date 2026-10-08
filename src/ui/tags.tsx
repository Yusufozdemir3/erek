// Task tags in the UI: the live list (useTags), the pills on a task card, the
// picker in the task form (a window with search and "create from what you
// typed"), the editor of Profile › Tags and the filter row on the Tasks screen.
// Data: db/repositories/tagRepo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tagRepo, type Tag } from '@/db';
import { cleanTagName, TAG_NAME_MAX_LEN, tagNameKey } from '@/db/repositories/tagRepo';
import { useI18n } from '@/i18n/I18nProvider';
import { useOptionalAppData } from '@/ui/AppData';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { HABIT_COLORS, type Colors } from '@/ui/theme';

// The user's live tags, re-read whenever app data changes. Outside the app's
// data provider (isolated component tests) there are none.
export function useTags(): { tags: Tag[]; byId: Map<string, Tag>; reload: () => void } {
  const app = useOptionalAppData();
  const userId = app?.user.id ?? null;
  const dataVersion = app?.dataVersion;
  const read = useCallback(() => (userId ? tagRepo.listByUser(userId) : []), [userId]);
  const [tags, setTags] = useState<Tag[]>(read);
  const reload = useCallback(() => setTags(read()), [read]);
  useEffect(reload, [reload, dataVersion]);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  return { tags, byId, reload };
}

// A task's ids → its live tags, in the user's tag order (unknown ids skipped:
// a deleted tag, or a friend's on a shared task).
export function tagsOf(ids: readonly string[], all: readonly Tag[]): Tag[] {
  if (ids.length === 0) return [];
  const set = new Set(ids);
  return all.filter((t) => set.has(t.id));
}

export function tagColor(tag: Pick<Tag, 'color'>, c: Colors): string {
  return tag.color ?? c.faint;
}

// ------------------------------------------------------------------ pills

const MAX_PILLS = 3;

// Under a card title: colored dot + name; past MAX_PILLS a "+n".
export function TagPills({ tags }: { tags: Tag[] }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (tags.length === 0) return null;
  const shown = tags.slice(0, MAX_PILLS);
  const rest = tags.length - shown.length;
  return (
    <View style={pill.row} accessibilityLabel={`${t('task.tags')}: ${tags.map((x) => x.name).join(', ')}`}>
      {shown.map((tag) => (
        <View key={tag.id} style={[pill.pill, { backgroundColor: colors.track }]}>
          <View style={[pill.dot, { backgroundColor: tagColor(tag, colors) }]} />
          <Text style={[pill.text, { color: colors.muted }]} numberOfLines={1}>
            {tag.name}
          </Text>
        </View>
      ))}
      {rest > 0 && (
        <View style={[pill.pill, { backgroundColor: colors.track }]}>
          <Text style={[pill.text, { color: colors.muted }]}>{t('tags.more', { n: rest })}</Text>
        </View>
      )}
    </View>
  );
}

const pill = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, maxWidth: 140 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
});

// ------------------------------------------------------------------ chip

function TagChip({
  tag,
  selected,
  onPress,
  onLongPress,
  a11yLabel,
}: {
  tag: Tag;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  a11yLabel?: string;
}) {
  const { colors } = useTheme();
  const color = tagColor(tag, colors);
  return (
    <Pressable
      style={[
        chip.chip,
        { borderColor: selected ? color : colors.border, backgroundColor: selected ? color + '24' : colors.inputBg },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={a11yLabel ?? tag.name}
    >
      <View style={[chip.dot, { backgroundColor: color }]} />
      <Text style={[chip.text, { color: selected ? colors.text : colors.muted }]} numberOfLines={1}>
        {tag.name}
      </Text>
      {selected && <Feather name="check" size={13} color={colors.text} />}
    </Pressable>
  );
}

const chip = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: 220,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  text: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});

// ------------------------------------------------------- color swatches

export function TagColorRow({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={swatch.row}>
      <Pressable
        style={[swatch.swatch, { backgroundColor: colors.faint }, value === null && { borderWidth: 3, borderColor: colors.text }]}
        onPress={() => onChange(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: value === null }}
        accessibilityLabel={t('tags.noColor')}
      />
      {HABIT_COLORS.map((c, i) => (
        <Pressable
          key={c}
          style={[swatch.swatch, { backgroundColor: c }, value === c && { borderWidth: 3, borderColor: colors.text }]}
          onPress={() => onChange(c)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === c }}
          accessibilityLabel={t('habit.colorOptionA11y', { n: i + 1 })}
        />
      ))}
    </View>
  );
}

const swatch = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
});

// ------------------------------------------------------- new-tag editor

// Name + color; `onSubmit` returns an error text to show, or null when done.
export function TagEditor({
  initialName = '',
  initialColor = null,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  initialName?: string;
  initialColor?: string | null;
  submitLabel: string;
  onSubmit: (name: string, color: string | null) => string | null;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor);
  const [error, setError] = useState<string | null>(null);
  const ready = tagNameKey(name).length > 0;
  const submit = () => {
    if (!ready) return;
    setError(onSubmit(name, color));
  };
  return (
    <View style={[editor.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <TextInput
        style={[editor.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder={t('tags.namePlaceholder')}
        placeholderTextColor={colors.faint}
        maxLength={TAG_NAME_MAX_LEN}
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {error && <Text style={[editor.error, { color: colors.danger }]}>{error}</Text>}
      <TagColorRow value={color} onChange={setColor} />
      <View style={editor.actions}>
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
          <Text style={[editor.cancel, { color: colors.muted }]}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[editor.add, { backgroundColor: colors.primary }, !ready && { opacity: 0.4 }]}
          onPress={submit}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
        >
          <Text style={[editor.addText, { color: colors.onAccent }]}>{submitLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const editor = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  error: { fontSize: 12, marginTop: -4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 },
  cancel: { fontSize: 14, fontWeight: '600' },
  add: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  addText: { fontSize: 14, fontWeight: '700' },
});

// ------------------------------------------------------------ picker

// A new tag's color: the first palette color no tag uses yet, then round again.
export function nextTagColor(tags: readonly Pick<Tag, 'color'>[]): string {
  const used = new Set(tags.map((t) => t.color));
  return HABIT_COLORS.find((c) => !used.has(c)) ?? HABIT_COLORS[tags.length % HABIT_COLORS.length];
}

// Search: name contains the query, case- and I/İ/ı-insensitive.
export function filterTags(tags: readonly Tag[], query: string): Tag[] {
  const q = tagNameKey(query);
  return q ? tags.filter((t) => tagNameKey(t.name).includes(q)) : [...tags];
}

// In the task form: the chosen tags and one "+ Tag" button, so the form stays
// one line however many tags there are. Both open TagSheet.
export function TagPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const app = useOptionalAppData();
  const { tags, reload } = useTags();
  const [open, setOpen] = useState(false);
  if (!app) return null;
  const chosen = tagsOf(selected, tags);

  return (
    <View style={picker.wrap}>
      <View style={picker.row}>
        {chosen.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            selected
            onPress={() => setOpen(true)}
            a11yLabel={t('tags.selectA11y', { name: tag.name })}
          />
        ))}
        <Pressable
          style={[chip.chip, picker.addChip, { borderColor: colors.border }]}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('tags.addA11y')}
        >
          <Feather name="plus" size={14} color={colors.primary} />
          <Text style={[chip.text, { color: colors.primary }]}>{t('tags.add')}</Text>
        </Pressable>
      </View>
      <TagSheet
        visible={open}
        onClose={() => setOpen(false)}
        tags={tags}
        selected={selected}
        onChange={onChange}
        onCreated={() => {
          reload();
          app.notifyDataChanged();
        }}
        userId={app.user.id}
      />
    </View>
  );
}

const picker = StyleSheet.create({
  wrap: { marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { borderStyle: 'dashed' },
});

// The picker window: search on top (typing a new name offers to create it),
// then every tag as a checkable row. Choices apply as you tap.
function TagSheet({
  visible,
  onClose,
  tags,
  selected,
  onChange,
  onCreated,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  tags: Tag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCreated: () => void;
  userId: string;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const shown = filterTags(tags, query);
  const clean = cleanTagName(query);
  const exact = clean ? tags.find((tag) => tagNameKey(tag.name) === tagNameKey(clean)) : undefined;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const create = () => {
    if (!clean) return;
    if (exact) {
      if (!selected.includes(exact.id)) onChange([...selected, exact.id]);
    } else {
      const tag = tagRepo.create(userId, clean, nextTagColor(tags));
      if (!tag) return;
      onCreated();
      onChange([...selected, tag.id]);
    }
    setQuery('');
  };

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <ModalCard visible={visible} onClose={close}>
      <View style={sheet.header}>
        <Text style={[sheet.title, { color: colors.text }]}>{t('task.tags')}</Text>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
          <Text style={[sheet.done, { color: colors.primary }]}>{t('common.done')}</Text>
        </Pressable>
      </View>
      <View style={[sheet.search, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.faint} />
        <TextInput
          style={[sheet.searchInput, { color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder={t('tags.searchOrCreate')}
          placeholderTextColor={colors.faint}
          maxLength={TAG_NAME_MAX_LEN}
          returnKeyType="done"
          onSubmitEditing={create}
          accessibilityLabel={t('tags.searchOrCreate')}
        />
      </View>
      {clean !== '' && !exact && (
        <Pressable style={sheet.row} onPress={create} accessibilityRole="button">
          <Feather name="plus-circle" size={18} color={colors.primary} />
          <Text style={[sheet.name, { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>
            {t('tags.createNamed', { name: clean })}
          </Text>
        </Pressable>
      )}
      {tags.length === 0 && clean === '' && (
        <Text style={[sheet.empty, { color: colors.faint }]}>{t('tags.noneYet')}</Text>
      )}
      {tags.length > 0 && shown.length === 0 && (
        <Text style={[sheet.empty, { color: colors.faint }]}>{t('tags.noMatch')}</Text>
      )}
      {shown.map((tag, i) => {
        const sel = selected.includes(tag.id);
        return (
          <Pressable
            key={tag.id}
            style={[sheet.row, (i > 0 || (clean !== '' && !exact)) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => toggle(tag.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sel }}
            accessibilityLabel={tag.name}
          >
            <View style={[sheet.dot, { backgroundColor: tagColor(tag, colors) }]} />
            <Text style={[sheet.name, { color: colors.text }, sel && { fontWeight: '700' }]} numberOfLines={1}>
              {tag.name}
            </Text>
            <View style={[sheet.box, { borderColor: sel ? colors.primary : colors.faint }, sel && { backgroundColor: colors.primary }]}>
              {sel && <Feather name="check" size={13} color={colors.onAccent} />}
            </View>
          </Pressable>
        );
      })}
    </ModalCard>
  );
}

const sheet = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  done: { fontSize: 15, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 6 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, fontSize: 15 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 13, paddingVertical: 14, textAlign: 'center' },
});

// ------------------------------------------------------------ filter

// Above the task list: "All" + one chip per tag that some task uses. One at a time.
export function TagFilterBar({
  tags,
  value,
  onChange,
}: {
  tags: Tag[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (tags.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filter.row} style={filter.scroll}>
      <Pressable
        style={[
          chip.chip,
          {
            borderColor: value === null ? colors.primary : colors.border,
            backgroundColor: value === null ? colors.primary : colors.inputBg,
          },
        ]}
        onPress={() => onChange(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: value === null }}
      >
        <Text style={[chip.text, { color: value === null ? colors.onAccent : colors.muted }]}>{t('tags.filterAll')}</Text>
      </Pressable>
      {tags.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          selected={value === tag.id}
          onPress={() => onChange(value === tag.id ? null : tag.id)}
          a11yLabel={t('tags.filterA11y', { name: tag.name })}
        />
      ))}
    </ScrollView>
  );
}

const filter = StyleSheet.create({
  scroll: { marginTop: 10, marginHorizontal: -4 },
  row: { gap: 8, paddingHorizontal: 4 },
});
