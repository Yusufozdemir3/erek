// The checklist opened inside a task card: a row tap ticks it, the last tick
// completes the parent, and a pasted block splits into lines.

import { fireEvent, act } from '@testing-library/react-native';
import { subtaskRepo, taskRepo, userRepo } from '@/db';
import { todayDate } from '@/lib/helpers';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { SubtaskChecklist, SubtaskProgress } from '@/ui/SubtaskChecklist';
import { splitSubtaskLines } from '@/ui/subtaskActions';

jest.setTimeout(20000);

jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: jest.fn(() => Promise.resolve()),
}));

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

describe('SubtaskChecklist', () => {
  it('satıra dokunmak işaretler; sonuncusu ana görevi tamamlar', async () => {
    const task = taskRepo.create({ user_id: userId, title: 'Market', due_date: todayDate() });
    subtaskRepo.createMany(task.id, ['Süt', 'Ekmek']);
    const onChanged = jest.fn();
    const { getByLabelText } = await renderUI(
      <SubtaskChecklist task={taskRepo.getById(task.id)!} refreshKey="0/2" onChanged={onChanged} />
    );

    await act(async () => {
      fireEvent.press(getByLabelText('Süt'));
    });
    expect(subtaskRepo.countForTask(task.id)).toEqual({ done: 1, total: 2 });
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();

    await act(async () => {
      fireEvent.press(getByLabelText('Ekmek'));
    });
    expect(taskRepo.getById(task.id)!.completed_at).not.toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('işaretli satıra dokunmak geri açar ve tamamlanmış görevi yeniden açar', async () => {
    const task = taskRepo.create({ user_id: userId, title: 'Market', due_date: todayDate() });
    const [a] = subtaskRepo.createMany(task.id, ['Süt']);
    subtaskRepo.setCompleted(a.id, true);
    taskRepo.setCompleted(task.id, true);
    const { getByLabelText } = await renderUI(
      <SubtaskChecklist task={taskRepo.getById(task.id)!} refreshKey="1/1" onChanged={jest.fn()} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Süt'));
    });
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();
  });
});

describe('SubtaskProgress', () => {
  it('2/5 yazar', async () => {
    const { getByText } = await renderUI(<SubtaskProgress done={2} total={5} />);
    expect(getByText('2/5')).toBeTruthy();
  });
});

describe('splitSubtaskLines', () => {
  it('boş satırları atar, madde işaretlerini ve numaraları temizler', () => {
    expect(splitSubtaskLines('- Süt\n* Ekmek\n3) Yumurta\n\n  Peynir  \r\n')).toEqual([
      'Süt',
      'Ekmek',
      'Yumurta',
      'Peynir',
    ]);
    expect(splitSubtaskLines('   \n')).toEqual([]);
  });
});
