// The search field shared by the list tabs (Tasks, Habits): magnifier, input,
// a clear button once there's text.

import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MAX_QUERY_LEN } from '@/lib/search';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  clearLabel: string;
}

export function SearchBox({ value, onChange, placeholder, clearLabel }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.box}>
      <Feather name="search" size={16} color={colors.faint} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        maxLength={MAX_QUERY_LEN}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={12} accessibilityRole="button" accessibilityLabel={clearLabel}>
          <Feather name="x" size={16} color={colors.faint} />
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
      paddingHorizontal: 12,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    input: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 8 },
  });
