// Ücretsiz sınırlar: hatırlatıcı eklemek, grafik sekmeleri, kilitli widget kartı, Plus uyarısı.

import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderUI } from '@/test/renderWithProviders';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { PeriodTabs } from '@/ui/habit/HabitStatsSections';
import { makeHabitStatsStyles } from '@/ui/habit/habitStatsStyles';
import { LockedWidget } from '@/widget/LockedWidget';
import { promptPlus } from '../openPlus';
import { COUNTER_WIDGET_NAME } from '@/widget/widgetSnapshot';
import { lightColors } from '@/ui/theme';

let mockUnlocked = false;
jest.mock('../plusStore', () => ({
  useFeaturesUnlocked: () => mockUnlocked,
  usePlusState: () => ({ billing: true, plus: false, adsFree: false, introEndsAt: null }),
  areFeaturesUnlocked: () => mockUnlocked,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('react-native-android-widget', () => {
  const { View, Text } = require('react-native');
  return { FlexWidget: View, TextWidget: ({ text }: { text: string }) => <Text>{text}</Text> };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUnlocked = false;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('hatırlatıcı sınırı', () => {
  it('kilitliyken ilk hatırlatıcıdan sonra ekleme düğmesi yerine Plus düğmesi çıkar', async () => {
    const u = await renderUI(<ReminderListEditor label="Saat" times={['08:00']} onChange={() => {}} />);
    expect(u.queryByText('＋ Saat ekle')).toBeNull();
    fireEvent.press(u.getByText('Daha fazla hatırlatıcı — Plus'));
    expect(Alert.alert).toHaveBeenCalledWith('Erek Plus', expect.stringContaining('hatırlatıcı'), expect.any(Array));
  });

  it('kilitliyken boşsa ilk hatırlatıcı eklenebilir', async () => {
    const u = await renderUI(<ReminderListEditor label="Saat" times={[]} onChange={() => {}} />);
    expect(u.queryByText('Daha fazla hatırlatıcı — Plus')).toBeNull();
  });

  it('açıkken Plus düğmesi çıkmaz', async () => {
    mockUnlocked = true;
    const u = await renderUI(<ReminderListEditor label="Saat" times={['08:00']} onChange={() => {}} />);
    expect(u.queryByText('Daha fazla hatırlatıcı — Plus')).toBeNull();
  });
});

describe('grafik sekmeleri', () => {
  const styles = makeHabitStatsStyles(lightColors);
  const t = (k: string) => k;

  it('kilitli sekme dönemi değiştirmez, kilit uyarısını çağırır', async () => {
    const onChange = jest.fn();
    const onLocked = jest.fn();
    const u = await renderUI(
      <PeriodTabs period="day" onChange={onChange} t={t} styles={styles} locked={['week', 'month']} onLocked={onLocked} />
    );
    fireEvent.press(u.getByLabelText('stats.periodWeek. plus.lockedA11y'));
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(u.getByText('stats.periodDay'));
    expect(onChange).toHaveBeenCalledWith('day');
  });
});

describe('kilitli widget', () => {
  it('başlığı ve kilit yazısını gösterir', async () => {
    const u = await renderUI(
      <LockedWidget
        name={COUNTER_WIDGET_NAME}
        snapshot={{ counterTitle: 'Sayaçlar', lockedLabel: 'Erek Plus ile açılır — dokun' } as never}
      />
    );
    expect(u.getByText('Sayaçlar')).toBeTruthy();
    expect(u.getByText('Erek Plus ile açılır — dokun')).toBeTruthy();
  });
});

describe('promptPlus', () => {
  it('Plus’a bak düğmesi Plus ekranını açar', () => {
    promptPlus('friends', (k) => k);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'plus.see')?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith('/plus');
  });
});
