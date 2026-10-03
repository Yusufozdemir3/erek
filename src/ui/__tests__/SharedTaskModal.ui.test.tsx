// Arkadaşın paylaştığı görev penceresi: alt görevler işaretlenebilir, ana görev
// onlarla birlikte tamamlanır/yeniden açılır, hata olursa her şey geri alınır.

import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { getDb } from '@/db/database';
import { subtaskRepo, taskRepo, userRepo } from '@/db';
import { SharedTaskModal } from '@/ui/SharedTaskModal';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { toggleSharedSubtask } from '@/sync/sharedTasks';
import { SharingError } from '@/sync/sharingErrors';

jest.mock('@/sync/sharedTasks', () => ({
  toggleSharedSubtask: jest.fn(),
  toggleSharedTask: jest.fn(),
}));
const mockToggle = toggleSharedSubtask as jest.Mock;

const FRIEND = 'friend-uid';
const OLD = '2026-07-01T10:00:00.000Z';
const NEW = '2026-07-01T12:00:00.000Z';

// A task owned by the friend (shared with me) + two subtasks, as sync pull leaves them.
function seedShared() {
  const user = userRepo.getOrCreateLocal();
  getDb().runSync(
    `INSERT INTO tasks (id, user_id, title, priority, updated_at, synced, shared_owner_uid)
     VALUES ('t-shared', ?, 'Market', 'medium', ?, 1, ?)`,
    [user.id, OLD, FRIEND]
  );
  for (const [id, title, pos] of [['s1', 'Süt', 0], ['s2', 'Ekmek', 1]] as const) {
    getDb().runSync(
      `INSERT INTO subtasks (id, task_id, title, completed, position, updated_at, deleted_at, synced)
       VALUES (?, 't-shared', ?, 0, ?, ?, NULL, 1)`,
      [id, title, pos, OLD]
    );
  }
  return taskRepo.getById('t-shared')!;
}

beforeEach(() => {
  resetTestDb();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('SharedTaskModal', () => {
  it('görevi, sahibini ve alt görevleri sayıyla gösterir', async () => {
    const task = seedShared();
    const { getByText } = await renderUI(
      <SharedTaskModal task={task} ownerName="Ayşe" onClose={jest.fn()} onChanged={jest.fn()} />
    );
    expect(getByText('Market')).toBeTruthy();
    expect(getByText('Ayşe seninle paylaştı')).toBeTruthy();
    expect(getByText('Süt')).toBeTruthy();
    expect(getByText('Ekmek')).toBeTruthy();
    expect(getByText('0/2')).toBeTruthy();
  });

  it('kapalıyken (task=null) hiçbir şey çizmez', async () => {
    const { toJSON } = await renderUI(
      <SharedTaskModal task={null} ownerName="Ayşe" onClose={jest.fn()} onChanged={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });

  it('alt görevi işaretleyince sunucu çağrılır, yerel kopya kuyruğa girmeden güncellenir', async () => {
    const task = seedShared();
    mockToggle.mockResolvedValue({
      completed: true,
      subtaskUpdatedAt: NEW,
      taskId: 't-shared',
      taskCompletedAt: null,
      taskUpdatedAt: OLD,
    });
    const onChanged = jest.fn();
    const { getByLabelText, getByText } = await renderUI(
      <SharedTaskModal task={task} ownerName="Ayşe" onClose={jest.fn()} onChanged={onChanged} />
    );

    fireEvent.press(getByLabelText('Süt'));

    await waitFor(() => expect(getByText('1/2')).toBeTruthy());
    expect(mockToggle).toHaveBeenCalledWith('s1', true);
    expect(subtaskRepo.listByTask('t-shared')[0]).toMatchObject({ completed: 1, updated_at: NEW, synced: 1 });
    expect(onChanged).toHaveBeenCalled();
  });

  it('son alt görev işaretlenince ana görev de tamamlanır (sunucunun cevabıyla)', async () => {
    const task = seedShared();
    subtaskRepo.applySharedCompletion('s1', true, OLD);
    mockToggle.mockResolvedValue({
      completed: true,
      subtaskUpdatedAt: NEW,
      taskId: 't-shared',
      taskCompletedAt: NEW,
      taskUpdatedAt: NEW,
    });
    const { getByLabelText, findByText } = await renderUI(
      <SharedTaskModal task={task} ownerName="Ayşe" onClose={jest.fn()} onChanged={jest.fn()} />
    );

    fireEvent.press(getByLabelText('Ekmek'));

    expect(await findByText('Tamamlandı')).toBeTruthy();
    expect(taskRepo.getById('t-shared')).toMatchObject({ completed_at: NEW, synced: 1 });
  });

  it('işaretlenmiş alt görevi geri alınca ana görev yeniden açılır', async () => {
    const task = seedShared();
    subtaskRepo.applySharedCompletion('s1', true, OLD);
    subtaskRepo.applySharedCompletion('s2', true, OLD);
    taskRepo.applySharedCompletion('t-shared', OLD, OLD);
    mockToggle.mockResolvedValue({
      completed: false,
      subtaskUpdatedAt: NEW,
      taskId: 't-shared',
      taskCompletedAt: null,
      taskUpdatedAt: NEW,
    });
    const { getByLabelText, queryByText, getByText } = await renderUI(
      <SharedTaskModal task={taskRepo.getById('t-shared')!} ownerName="Ayşe" onClose={jest.fn()} onChanged={jest.fn()} />
    );
    expect(getByText('Tamamlandı')).toBeTruthy();

    fireEvent.press(getByLabelText('Süt'));

    await waitFor(() => expect(queryByText('Tamamlandı')).toBeNull());
    expect(taskRepo.getById('t-shared')?.completed_at).toBeNull();
    void task;
  });

  it('sunucu reddederse işaret geri alınır ve hata gösterilir', async () => {
    const task = seedShared();
    mockToggle.mockRejectedValue(new SharingError('ERK_NETWORK'));
    const { getByLabelText, getByText } = await renderUI(
      <SharedTaskModal task={task} ownerName="Ayşe" onClose={jest.fn()} onChanged={jest.fn()} />
    );

    fireEvent.press(getByLabelText('Süt'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(subtaskRepo.listByTask('t-shared')[0]).toMatchObject({ completed: 0, updated_at: OLD });
    expect(getByText('0/2')).toBeTruthy();
  });

  it('paylaşım bitmişse (ERK_NOT_SHARED) pencere kapanır', async () => {
    const task = seedShared();
    mockToggle.mockRejectedValue(new SharingError('ERK_NOT_SHARED'));
    const onClose = jest.fn();
    const { getByLabelText } = await renderUI(
      <SharedTaskModal task={task} ownerName="Ayşe" onClose={onClose} onChanged={jest.fn()} />
    );

    fireEvent.press(getByLabelText('Süt'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('"Kapat" pencereyi kapatır', async () => {
    const task = seedShared();
    const onClose = jest.fn();
    const { getByText } = await renderUI(
      <SharedTaskModal task={task} ownerName="Ayşe" onClose={onClose} onChanged={jest.fn()} />
    );
    await act(async () => {
      fireEvent.press(getByText('Kapat'));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
