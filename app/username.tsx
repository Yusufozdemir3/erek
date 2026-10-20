// Profile › Username: the name friends see (not the Google name). Names can
// repeat — the server adds a hidden tag to tell people apart — so there is no
// "taken" error. Also opened once at launch for accounts that have none yet.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n/I18nProvider';
import { checkUsername, USERNAME_MAX } from '@/lib/username';
import { getMyUsername, setMyUsername } from '@/sync';
import { useAppData } from '@/ui/AppData';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';

export default function UsernameScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const { authUser } = useAppData();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const uid = authUser && !authUser.isAnonymous ? authUser.id : null;
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid) getMyUsername(uid).then((n) => n && setName(n)).catch(() => {});
  }, [uid]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const save = async () => {
    const check = checkUsername(name);
    if (check !== 'ok') return setError(t(`username.err.${check}`));
    setSaving(true);
    setError(null);
    const result = await setMyUsername(name.trim());
    setSaving(false);
    if (result === 'ok') close();
    else setError(t(result === 'invalid' ? 'username.err.badChars' : 'username.err.failed'));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>{t(first ? 'username.introFirst' : 'username.intro')}</Text>
      <View style={[styles.card, { marginTop: 16 }]}>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder={t('username.placeholder')}
          placeholderTextColor={colors.faint}
          maxLength={USERNAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          onSubmitEditing={save}
          style={{ fontSize: 16, color: colors.text, paddingVertical: 8 }}
          accessibilityLabel={t('username.title')}
        />
        {error && <Text style={styles.errText}>{error}</Text>}
      </View>
      <Pressable
        style={[styles.syncBtn, { marginTop: 16 }, saving && styles.syncBtnDisabled]}
        onPress={save}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.syncBtnText}>{t('common.save')}</Text>
      </Pressable>
      {first ? (
        <Pressable style={[styles.outlineBtn, { marginTop: 10 }]} onPress={close} accessibilityRole="button">
          <Text style={styles.outlineBtnText}>{t('username.later')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
