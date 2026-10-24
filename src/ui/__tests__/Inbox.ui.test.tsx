// Bildirimler: zil okunmamış varken nokta gösterir; ekran tebrik/haber/hatırlatma
// satırlarını listeler, açılınca hepsini okundu sayar, dokununca öğeyi açar.

import { fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import InboxScreen from '../../../app/inbox';
import { HeaderActions } from '@/ui/HeaderActions';
import { __resetInboxForTests } from '@/ui/useInbox';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { goalRepo, userRepo } from '@/db';
import type { InboxItem } from '@/lib/inbox';

let mockAuthUser: { id: string; isAnonymous: boolean } | null = { id: 'me', isAnonymous: false };
let mockItems: InboxItem[] = [];
let mockSeenAt: string | null = null;
const mockSetSeen = jest.fn(async (iso: string) => {
  mockSeenAt = iso;
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    router: { push: jest.fn() },
  };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: 'local' }, authUser: mockAuthUser }),
}));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/sync', () => ({
  getCachedInbox: jest.fn(async () => []),
  getInbox: jest.fn(async () => mockItems),
  getInboxSeenAt: jest.fn(async () => mockSeenAt),
  setInboxSeenAt: (iso: string) => mockSetSeen(iso),
}));

let goalId = '';
const entry = (over: Partial<InboxItem>): InboxItem => ({
  id: 'x',
  type: 'congrats',
  kind: 'goal',
  itemId: goalId,
  senderId: 'u1',
  senderName: 'Ali',
  itemTitle: '100 km koş',
  createdAt: '2026-10-24T10:00:00Z',
  ...over,
});

beforeEach(async () => {
  await resetTestDb();
  __resetInboxForTests();
  jest.clearAllMocks();
  mockAuthUser = { id: 'me', isAnonymous: false };
  mockSeenAt = null;
  const uid = userRepo.getOrCreateLocal().id;
  goalId = goalRepo.create({ user_id: uid, title: '100 km koş', goal_type: 'numeric', target_value: 100 }).id;
  mockItems = [
    entry({ id: '1' }),
    entry({ id: '2', type: 'nudge', senderName: 'Ayşe', createdAt: '2026-10-23T09:00:00Z' }),
    entry({ id: '3', type: 'finished', itemId: '22222222-2222-4222-8222-222222222222', itemTitle: 'Kitap', createdAt: '2026-10-22T09:00:00Z' }),
  ];
});

describe('Zil', () => {
  it('okunmamış varken sayıyla etiketlenir, basınca Bildirimler açılır', async () => {
    const u = await renderUI(<HeaderActions />);
    const bell = await u.findByLabelText('Bildirimleri aç, 3 okunmamış');
    fireEvent.press(bell);
    expect(router.push).toHaveBeenCalledWith('/inbox');
  });

  it('hepsi görüldüyse sayı yok', async () => {
    mockSeenAt = '2026-10-24T10:00:00Z';
    const u = await renderUI(<HeaderActions />);
    expect(await u.findByLabelText('Bildirimleri aç')).toBeTruthy();
  });

  it('girişsizken zil yok', async () => {
    mockAuthUser = null;
    const u = await renderUI(<HeaderActions />);
    expect(u.queryByLabelText(/Bildirimleri aç/)).toBeNull();
  });
});

describe('Bildirimler ekranı', () => {
  it('üç türü de metniyle listeler ve açılınca okundu sayar', async () => {
    const u = await renderUI(<InboxScreen />);
    expect(await u.findByText('Ali seni “100 km koş” için tebrik etti 🎉')).toBeTruthy();
    expect(u.getByText('Ayşe sana “100 km koş” için hatırlatma gönderdi')).toBeTruthy();
    expect(u.getByText('Ali “Kitap” işini tamamladı 🎉')).toBeTruthy();
    await waitFor(() => expect(mockSetSeen).toHaveBeenCalledWith('2026-10-24T10:00:00Z'));
  });

  it('tebrike dokununca kendi hedefim açılır', async () => {
    const u = await renderUI(<InboxScreen />);
    fireEvent.press(await u.findByText('Ali seni “100 km koş” için tebrik etti 🎉'));
    expect(router.push).toHaveBeenCalledWith(`/goal/${goalId}`);
  });

  it('artık bende olmayan öğe açılmaz', async () => {
    mockItems = [entry({ id: '9', itemId: '33333333-3333-4333-8333-333333333333' })];
    const u = await renderUI(<InboxScreen />);
    fireEvent.press(await u.findByText('Ali seni “100 km koş” için tebrik etti 🎉'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('boşken açıklama gösterir', async () => {
    mockItems = [];
    const u = await renderUI(<InboxScreen />);
    expect(await u.findByText('Henüz bildirim yok')).toBeTruthy();
  });
});
