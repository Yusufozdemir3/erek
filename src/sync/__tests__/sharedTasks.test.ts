// Karşı tarafın (görevin paylaşıldığı arkadaşın) tek yazma yolları: ana görevi
// ve alt görevlerini işaretlemek. Sunucu cevabı doğru çevrilmeli, hatalar
// ham metin yerine ERK_* koduna dönmeli.

import { SharingError } from '../sharingErrors';
import { toggleSharedSubtask, toggleSharedTask } from '../sharedTasks';

const mockRpc = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

beforeEach(() => mockRpc.mockReset());

const SUB = '00000000-0000-0000-0000-000000005a01';
const TASK = '00000000-0000-0000-0000-0000000000a5';

describe('toggleSharedSubtask', () => {
  it('RPC\'yi doğru parametrelerle çağırır ve alt görev + ana görev durumunu döner', async () => {
    mockRpc.mockResolvedValue({
      data: {
        completed: 1,
        subtask_updated_at: '2026-10-03T10:00:00.000Z',
        task_id: TASK,
        task_completed_at: '2026-10-03T10:00:00.000Z',
        task_updated_at: '2026-10-03T10:00:00.001Z',
      },
      error: null,
    });

    const r = await toggleSharedSubtask(SUB, true);

    expect(mockRpc).toHaveBeenCalledWith('toggle_shared_subtask', { p_subtask_id: SUB, p_completed: true });
    expect(r).toEqual({
      completed: true,
      subtaskUpdatedAt: '2026-10-03T10:00:00.000Z',
      taskId: TASK,
      taskCompletedAt: '2026-10-03T10:00:00.000Z',
      taskUpdatedAt: '2026-10-03T10:00:00.001Z',
    });
  });

  it('ana görev açık kalırsa taskCompletedAt null gelir; geri alma completed=false', async () => {
    mockRpc.mockResolvedValue({
      data: { completed: 0, subtask_updated_at: 'a', task_id: TASK, task_completed_at: null, task_updated_at: 'b' },
      error: null,
    });
    expect(await toggleSharedSubtask(SUB, false)).toMatchObject({ completed: false, taskCompletedAt: null });
  });

  it('paylaşım bitmişse ERK_NOT_SHARED', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'ERK_NOT_SHARED' }, error: null });
    await expect(toggleSharedSubtask(SUB, true)).rejects.toMatchObject({ code: 'ERK_NOT_SHARED' });
  });

  it('eksik/bozuk cevap ERK_UNKNOWN olur (yerel veriye yarım yazılmaz)', async () => {
    mockRpc.mockResolvedValue({ data: { completed: 1 }, error: null });
    await expect(toggleSharedSubtask(SUB, true)).rejects.toMatchObject({ code: 'ERK_UNKNOWN' });
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(toggleSharedSubtask(SUB, true)).rejects.toBeInstanceOf(SharingError);
  });

  it('ağ hatası SharingError\'a çevrilir', async () => {
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    await expect(toggleSharedSubtask(SUB, true)).rejects.toBeInstanceOf(SharingError);
  });
});

describe('toggleSharedTask (ana görev)', () => {
  it('hâlâ aynı sözleşmeyle çalışır', async () => {
    mockRpc.mockResolvedValue({
      data: { completed_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z' },
      error: null,
    });
    expect(await toggleSharedTask(TASK, true)).toEqual({
      completedAt: '2026-10-03T10:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    });
    expect(mockRpc).toHaveBeenCalledWith('toggle_shared_task', { p_task_id: TASK, p_completed: true });
  });
});
