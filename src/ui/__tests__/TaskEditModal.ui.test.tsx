// TaskEditModal on the real (in-memory) repos: ticking every subtask completes
// the task, reopening one reopens it.

import { fireEvent, act } from '@testing-library/react-native';
import { subtaskRepo, taskRepo, userRepo } from '@/db';

// Real SQLite + a full render can pass 5 s under a parallel run.
jest.setTimeout(20000);
import { todayDate } from '@/lib/helpers';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { TaskEditModal } from '@/ui/TaskEditModal';

// The notification side effect isn't the subject of this test — a silent double.
jest.mock('@/lib/notifications', () => ({
  scheduleTaskReminders: jest.fn(() => Promise.resolve(true)),
  cancelTaskReminders: jest.fn(() => Promise.resolve()),
  refreshTaskReminders: jest.fn(() => Promise.resolve()),
}));

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

function taskWithSubtasks(titles: string[]) {
  const task = taskRepo.create({ user_id: userId, title: 'Ana görev', due_date: todayDate() });
  const subs = titles.map((t) => subtaskRepo.create(task.id, t));
  return { task, subs };
}

describe('TaskEditModal — alt görev / ana görev senkronu', () => {
  it('tüm alt görevler işaretlenince ana görev otomatik tamamlanır', async () => {
    const { task } = taskWithSubtasks(['Alt 1', 'Alt 2']);
    const onChanged = jest.fn();
    const { getAllByRole } = await renderUI(
      <TaskEditModal task={taskRepo.getById(task.id)} onClose={jest.fn()} onChanged={onChanged} />
    );

    // Check off the first subtask → 1/2, parent task still open.
    await act(async () => {
      fireEvent.press(getAllByRole('checkbox')[0]);
    });
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();

    // Check off the second subtask too → 2/2, parent task auto-completes.
    await act(async () => {
      fireEvent.press(getAllByRole('checkbox')[1]);
    });
    expect(taskRepo.getById(task.id)!.completed_at).not.toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('bir alt görev geri açılınca ana görev de geri açılır', async () => {
    const { task, subs } = taskWithSubtasks(['Alt 1', 'Alt 2']);
    // Initial state: both done + parent task completed.
    subtaskRepo.setCompleted(subs[0].id, true);
    subtaskRepo.setCompleted(subs[1].id, true);
    taskRepo.setCompleted(task.id, true);

    const { getAllByRole } = await renderUI(
      <TaskEditModal task={taskRepo.getById(task.id)} onClose={jest.fn()} onChanged={jest.fn()} />
    );
    expect(taskRepo.getById(task.id)!.completed_at).not.toBeNull();

    // Reopen one subtask → the parent task must reopen too.
    await act(async () => {
      fireEvent.press(getAllByRole('checkbox')[0]);
    });
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();
  });

  it('alt görevi olmayan görevde otomatik tamamlama kuralı devreye girmez', async () => {
    const task = taskRepo.create({ user_id: userId, title: 'Yalnız görev', due_date: todayDate() });
    const onChanged = jest.fn();
    const { queryAllByRole } = await renderUI(
      <TaskEditModal task={taskRepo.getById(task.id)} onClose={jest.fn()} onChanged={onChanged} />
    );
    // No subtasks (checkboxes) at all; the task stays not-completed on its own.
    expect(queryAllByRole('checkbox')).toHaveLength(0);
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();
  });
});

describe('TaskEditModal — alt görev düzenleme', () => {
  it('yapıştırılan çok satırlı metin her satır için ayrı alt görev oluşturur', async () => {
    const { task } = taskWithSubtasks([]);
    const { getByPlaceholderText, getByLabelText } = await renderUI(
      <TaskEditModal task={taskRepo.getById(task.id)} onClose={jest.fn()} onChanged={jest.fn()} />
    );
    fireEvent.changeText(getByPlaceholderText('Alt görev ekle…'), '- Süt\n2. Ekmek\n\n  Yumurta  ');
    await act(async () => {
      fireEvent.press(getByLabelText('Alt görev ekle…'));
    });
    expect(subtaskRepo.listByTask(task.id).map((s) => s.title)).toEqual(['Süt', 'Ekmek', 'Yumurta']);
  });

  it('yazıya dokunup adı değiştirir; boş bırakılırsa eski ad kalır', async () => {
    const { task, subs } = taskWithSubtasks(['Eski ad']);
    const { getByLabelText } = await renderUI(
      <TaskEditModal task={taskRepo.getById(task.id)} onClose={jest.fn()} onChanged={jest.fn()} />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Eski ad alt görevinin adını değiştir'));
    });
    const input = getByLabelText('Eski ad alt görevinin adını değiştir');
    fireEvent.changeText(input, 'Yeni ad');
    await act(async () => {
      fireEvent(input, 'submitEditing');
    });
    expect(subtaskRepo.listByTask(task.id)[0].title).toBe('Yeni ad');

    await act(async () => {
      fireEvent.press(getByLabelText('Yeni ad alt görevinin adını değiştir'));
    });
    const input2 = getByLabelText('Yeni ad alt görevinin adını değiştir');
    fireEvent.changeText(input2, '   ');
    await act(async () => {
      fireEvent(input2, 'submitEditing');
    });
    expect(subtaskRepo.listByTask(task.id)[0].title).toBe('Yeni ad');
    expect(subs).toHaveLength(1);
  });
});
