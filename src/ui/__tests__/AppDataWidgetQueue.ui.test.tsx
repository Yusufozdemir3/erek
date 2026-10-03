// Uygulama açıkken widget dokunuşu hemen veritabanına yazılır ve ekranlar
// yenilenir; açılışta da bekleyenler boşaltılır.

import * as React from 'react';
import { Text } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';
import { renderUI } from '@/test/renderWithProviders';
import { AppDataProvider, useAppData } from '@/ui/AppData';
import { emitWidgetAction } from '@/widget/widgetQueue';

// The provider pulls in most of the app's modules; under a full parallel run
// the first render can take longer than the default 5 s.
jest.setTimeout(30000);

const mockDrain = jest.fn();
const mockRefresh = jest.fn();

jest.mock('@/db', () => ({
  initDataLayer: jest.fn(async () => ({ user: { id: 'u1' } })),
  userRepo: { getOrCreateLocal: () => ({ id: 'u1' }) },
}));
jest.mock('@/sync', () => ({
  currentAuthUser: jest.fn(async () => null),
  runSync: jest.fn(async () => ({ status: 'disabled' })),
}));
jest.mock('@/lib/notifications', () => ({
  migrateToMultiReminderIfNeeded: jest.fn(async () => {}),
  rescheduleEverything: jest.fn(),
}));
jest.mock('@/lib/ads', () => ({ maybeShowInterstitial: jest.fn() }));
jest.mock('@/widget/widgetData', () => ({
  drainWidgetQueue: (...a: unknown[]) => mockDrain(...a),
  refreshWidget: (...a: unknown[]) => mockRefresh(...a),
}));

function Version() {
  const { dataVersion } = useAppData();
  return <Text>{`v${dataVersion}`}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('açılışta kuyruk boşaltılır; değişiklik yoksa ekranlar boşuna yenilenmez', async () => {
  mockDrain.mockResolvedValue(0);
  const u = await renderUI(
    <AppDataProvider>
      <Version />
    </AppDataProvider>
  );
  await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(1));
  expect(u.getByText('v0')).toBeTruthy();
});

it('uygulama açıkken gelen dokunuş hemen yazılır, ekranlar ve widget yenilenir', async () => {
  mockDrain.mockResolvedValue(0);
  const u = await renderUI(
    <AppDataProvider>
      <Version />
    </AppDataProvider>
  );
  await waitFor(() => expect(mockDrain).toHaveBeenCalledTimes(1));
  const refreshesBefore = mockRefresh.mock.calls.length;

  mockDrain.mockResolvedValue(1);
  await act(async () => {
    emitWidgetAction();
  });

  await waitFor(() => expect(u.getByText('v1')).toBeTruthy());
  expect(mockDrain).toHaveBeenCalledTimes(2);
  expect(mockRefresh.mock.calls.length).toBeGreaterThan(refreshesBefore);
});
