// Arkadaşlar ekranında rehber: yalnız girişliyken, yeni kurulumda kendiliğinden açılır; bağlantıyla yeniden açılır.
// Girişsizken açılmaz ve "görüldü" yazılmaz (sonra giriş yapınca yine görsün).

import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FriendsScreen from '../../../app/friends';
import { renderUI } from '@/test/renderWithProviders';

let mockAuth: { id: string; isAnonymous: boolean } | null = null;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    router: { push: jest.fn() },
  };
});
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
}));
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ authUser: mockAuth, user: { id: 'u' }, dataVersion: 0, notifyDataChanged: jest.fn() }),
}));
jest.mock('@/lib/notifications', () => ({ ensurePermission: jest.fn(async () => true) }));
jest.mock('@/lib/pushRegistration', () => ({ syncPushRegistration: jest.fn() }));
jest.mock('@/sync', () => ({
  getCachedFriends: jest.fn(async () => []),
  getInvite: jest.fn(async () => null),
  getNudgePrefs: jest.fn(async () => ({ enabled: true, muted: [] })),
  INVITE_CODE_LENGTH: 8,
  listConnections: jest.fn(async () => []),
  normalizeInviteCode: (c: string) => c.replace(/\s/g, '').toUpperCase(),
  redeemInvite: jest.fn(),
  removeConnection: jest.fn(),
  setNudgeMute: jest.fn(async () => true),
  sharingErrorKey: () => 'friends.err.ERK_UNKNOWN',
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockAuth = { id: 'a', isAnonymous: false };
});

describe('Arkadaşlar rehberi', () => {
  it('girişli yeni kurulumda ilk girişte açılır; Atla kapatır', async () => {
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<FriendsScreen />);
    expect(await u.findByText('Arkadaşlarla birlikte')).toBeTruthy();
    fireEvent.press(u.getByText('Atla'));
    await waitFor(() => expect(u.queryByText('Arkadaşlarla birlikte')).toBeNull());
    expect(await AsyncStorage.getItem('guide:seen:friends')).toBe('1');
  });

  it('"Arkadaşlar nasıl çalışır?" bağlantısı rehberi yeniden açar; 6 sayfa', async () => {
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<FriendsScreen />);
    fireEvent.press(await u.findByText('Arkadaşlar nasıl çalışır?'));
    expect(await u.findByText('Arkadaşlarla birlikte')).toBeTruthy();
    for (let i = 0; i < 5; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText('Kontrol sende')).toBeTruthy();
    expect(u.getByText('Tamam')).toBeTruthy();
  });

  it('girişsizken açılmaz ve görüldü sayılmaz', async () => {
    mockAuth = null;
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<FriendsScreen />);
    await u.findByText('Arkadaş eklemek için Google ile giriş yapmalısın.');
    await new Promise((r) => setTimeout(r, 30));
    expect(u.queryByText('Arkadaşlarla birlikte')).toBeNull();
    expect(await AsyncStorage.getItem('guide:seen:friends')).toBeNull();
  });
});
