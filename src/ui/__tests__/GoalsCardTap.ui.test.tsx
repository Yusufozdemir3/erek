// Hedefler sekmesinde dokunma: kart Genel sekmesini açar (ilerleme orada
// girilir), adım adım hedefin kutusu Adımlar sekmesini açar.

import { fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import GoalsScreen from '../../../app/(tabs)/goals';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { goalRepo, userRepo } from '@/db';

let mockUserId = '';

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]), router: { push: jest.fn() } };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, authUser: null, dataVersion: 0, notifyDataChanged: jest.fn() }),
}));
jest.mock('@/lib/notifications', () => ({
  cancelGoalReminders: jest.fn(async () => {}),
  rescheduleEverything: jest.fn(async () => {}),
}));
jest.mock('@/ui/HeaderActions', () => ({ HeaderActions: () => null }));
jest.mock('@/ui/SharedLists', () => ({
  useSharedLists: () => ({ reload: jest.fn() }),
  SharedGoalsSection: () => null,
}));

beforeEach(async () => {
  await resetTestDb();
  mockUserId = userRepo.getOrCreateLocal().id;
  (router.push as jest.Mock).mockClear();
});

describe('Hedefler: karta dokunma', () => {
  it('başlığa dokununca Genel sekmesi açılır', async () => {
    const g = goalRepo.create({ user_id: mockUserId, title: '100 km koş', goal_type: 'numeric', target_value: 100 });
    const u = await renderUI(<GoalsScreen />);

    fireEvent.press(u.getByLabelText('100 km koş hedefini aç'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/goal/[id]', params: { id: g.id, tab: 'overview' } });
  });

  it('adım adım hedefin kutusu Adımlar sekmesini açar', async () => {
    const g = goalRepo.create({ user_id: mockUserId, title: 'Ev taşı', goal_type: 'milestone' });
    const u = await renderUI(<GoalsScreen />);

    fireEvent.press(u.getByLabelText('Ev taşı adımlarını aç'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/goal/[id]', params: { id: g.id, tab: 'milestones' } });
  });

  it('sayısal hedefte kutu yok', async () => {
    goalRepo.create({ user_id: mockUserId, title: '100 km koş', goal_type: 'numeric', target_value: 100 });
    const u = await renderUI(<GoalsScreen />);
    expect(u.queryByLabelText('100 km koş adımlarını aç')).toBeNull();
  });
});
