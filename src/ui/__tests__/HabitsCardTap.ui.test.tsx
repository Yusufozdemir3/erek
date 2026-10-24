// Alışkanlıklar sekmesinde karta dokunmak istatistik ekranını açar (Hedefler ve
// Görevler gibi); düzenleme penceresi açılmaz, düzenleme kaydırmada kalır.

import { fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
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

beforeEach(async () => {
  await resetTestDb();
  mockUserId = userRepo.getOrCreateLocal().id;
  (router.push as jest.Mock).mockClear();
});

describe('Alışkanlıklar: karta dokunma', () => {
  it('başlığa dokununca istatistik ekranı açılır, düzenleme penceresi açılmaz', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    const u = await renderUI(<HabitsScreen />);

    fireEvent.press(u.getByText('Kitap oku'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/habit/[id]', params: { id: h.id } });
    expect(u.queryByText('Alışkanlığı düzenle')).toBeNull();
  });
});
