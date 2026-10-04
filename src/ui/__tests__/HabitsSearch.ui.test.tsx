// Alışkanlıklar sekmesinde arama: 8+ alışkanlıkta görünür, başlığa göre süzer.

import { fireEvent } from '@testing-library/react-native';
import HabitsScreen from '../../../app/(tabs)/habits';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { habitRepo, userRepo } from '@/db';

let mockUserId = '';

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]), router: { push: jest.fn() } };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, dataVersion: 0, notifyDataChanged: jest.fn() }),
}));
jest.mock('@/lib/notifications', () => ({ cancelHabitReminders: jest.fn(async () => {}) }));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/ui/SharedLists', () => ({
  useSharedLists: () => ({ reload: jest.fn() }),
  SharedHabitsSection: () => null,
}));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return { __esModule: true, default: { View: RN.View, createAnimatedComponent: (c: unknown) => c }, LinearTransition: { duration: () => ({}) } };
});

const PLACEHOLDER = 'Alışkanlıklarda ara';

beforeEach(async () => {
  await resetTestDb();
  mockUserId = userRepo.getOrCreateLocal().id;
});

const seed = (n: number) => {
  for (let i = 0; i < n; i++) habitRepo.create({ user_id: mockUserId, title: `Alışkanlık ${i}` });
};

describe('Alışkanlıklar: arama', () => {
  it('kısa listede arama kutusu yok', async () => {
    seed(3);
    const u = await renderUI(<HabitsScreen />);
    expect(u.queryByLabelText(PLACEHOLDER)).toBeNull();
  });

  it('uzun listede süzer (aksansız), eşleşme yoksa açıklar, temizleyince geri gelir', async () => {
    seed(9);
    habitRepo.create({ user_id: mockUserId, title: 'Koşu yap' });
    const u = await renderUI(<HabitsScreen />);
    fireEvent.changeText(u.getByLabelText(PLACEHOLDER), 'KOSU');
    expect(await u.findByText('Koşu yap')).toBeTruthy();
    expect(u.queryByText('Alışkanlık 1')).toBeNull();

    fireEvent.changeText(u.getByLabelText(PLACEHOLDER), 'zzzz');
    expect(await u.findByText('Eşleşen alışkanlık yok')).toBeTruthy();

    fireEvent.press(u.getByLabelText('Aramayı temizle'));
    expect(await u.findByText('Alışkanlık 1')).toBeTruthy();
  });
});
