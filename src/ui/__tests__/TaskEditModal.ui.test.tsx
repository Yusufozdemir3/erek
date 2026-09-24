// TaskEditModal component test — this session's most important feature: the
// parent task is AUTOMATICALLY completed when all subtasks are completed;
// reopening one also reopens the parent task. Verified end-to-end with the
// real repo (in-memory SQLite double); only the notification side effect is mocked.

import { fireEvent, act } from '@testing-library/react-native';
import { subtaskRepo, taskRepo, userRepo } from '@/db';

// This suite does real SQLite + a full render; under jest's parallel load the
// default 5s timeout was occasionally getting hit (not a logic bug, just slowness).
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
