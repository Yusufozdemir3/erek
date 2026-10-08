// Profile › Tags: rename, recolor or delete the tags put on tasks. Tags are
// created in the task form ("New tag"); this is only where they're tidied up.

import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tagRepo, type Tag } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { makeProfileStyles } from '@/ui/profileStyles';
import { TagEditor, tagColor, useTags } from '@/ui/tags';
import { useTheme } from '@/ui/ThemeProvider';

export default function TagsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const { user, notifyDataChanged } = useAppData();
  const { tags, reload } = useTags();
  const [editing, setEditing] = useState<string | null>(null);

  const changed = () => {
    reload();
    notifyDataChanged();
  };

  const save = (tag: Tag) => (name: string, color: string | null): string | null => {
    const other = tagRepo.findByName(user.id, name);
    if (other && other.id !== tag.id) return t('tags.exists', { name: other.name });
    if (!tagRepo.update(tag.id, { name, color })) return null;
    setEditing(null);
    changed();
    return null;
  };

  const confirmDelete = (tag: Tag) => {
    const n = tagRepo.countTasks(user.id, tag.id);
    Alert.alert(t('tags.deleteTitle', { name: tag.name }), n > 0 ? t('tags.deleteBody', { n }) : t('tags.deleteBodyNone'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          tagRepo.softDelete(tag.id);
          setEditing(null);
          changed();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>{t('tags.manageHint')}</Text>
      {tags.length === 0 ? (
        <EmptyState icon="tag" title={t('tags.emptyTitle')} subtitle={t('tags.emptyBody')} />
      ) : (
        <View style={[styles.card, local.list]}>
          {tags.map((tag, i) => (
            <View key={tag.id} style={i > 0 && [local.divider, { borderTopColor: colors.border }]}>
              {editing === tag.id ? (
                <TagEditor
                  initialName={tag.name}
                  initialColor={tag.color}
                  submitLabel={t('common.save')}
                  onSubmit={save(tag)}
                  onCancel={() => setEditing(null)}
                  autoFocus
                />
              ) : (
                <View style={local.row}>
                  <Pressable
                    style={local.main}
                    onPress={() => setEditing(tag.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('tags.editA11y', { name: tag.name })}
                  >
                    <View style={[local.dot, { backgroundColor: tagColor(tag, colors) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[local.name, { color: colors.text }]} numberOfLines={1}>
                        {tag.name}
                      </Text>
                      <Text style={[local.count, { color: colors.faint }]}>
                        {t('tags.taskCount', { n: tagRepo.countTasks(user.id, tag.id) })}
                      </Text>
                    </View>
                    <Feather name="edit-2" size={16} color={colors.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(tag)}
                    hitSlop={10}
                    style={local.delete}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.deleteA11y', { title: tag.name })}
                  >
                    <Feather name="trash-2" size={16} color={colors.danger} />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  list: { marginTop: 16, paddingVertical: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { fontSize: 15, fontWeight: '600' },
  count: { fontSize: 12, marginTop: 2 },
  delete: { paddingLeft: 16, paddingVertical: 4 },
});
