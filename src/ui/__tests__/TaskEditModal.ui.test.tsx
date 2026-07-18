// TaskEditModal bileşen testi — bu oturumun en önemli özelliği: alt görevler
// tamamlanınca ana görev OTOMATİK tamamlanır; biri geri açılınca ana görev de
// geri açılır. Gerçek repo (in-memory SQLite dublörü) ile uçtan uca doğrulanır;
// yalnızca bildirim yan etkisi mock'lanır.

import { fireEvent, act } from '@testing-library/react-native';
import { subtaskRepo, taskRepo, userRepo } from '@/db';

// Bu suite gerçek SQLite + tam render yapıyor; jest paralel yükü altında
// varsayılan 5sn timeout ara sıra sıyrılıyordu (mantık hatası değil, yavaşlık).
jest.setTimeout(20000);
import { todayDate } from '@/lib/helpers';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { TaskEditModal } from '@/ui/TaskEditModal';

// Bildirim yan etkisi bu testin konusu değil — sessiz dublör.
jest.mock('@/lib/notifications', () => ({
  scheduleTaskReminder: jest.fn(() => Promise.resolve(true)),
  cancelTaskReminder: jest.fn(() => Promise.resolve()),
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

    // İlk alt görevi işaretle → 1/2, ana görev hâlâ açık.
    await act(async () => {
      fireEvent.press(getAllByRole('checkbox')[0]);
    });
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();

    // İkinci alt görevi de işaretle → 2/2, ana görev otomatik tamamlanır.
    await act(async () => {
      fireEvent.press(getAllByRole('checkbox')[1]);
    });
    expect(taskRepo.getById(task.id)!.completed_at).not.toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('bir alt görev geri açılınca ana görev de geri açılır', async () => {
    const { task, subs } = taskWithSubtasks(['Alt 1', 'Alt 2']);
    // Başlangıç durumu: her ikisi tamam + ana görev tamamlanmış.
    subtaskRepo.setCompleted(subs[0].id, true);
    subtaskRepo.setCompleted(subs[1].id, true);
    taskRepo.setCompleted(task.id, true);

    const { getAllByRole } = await renderUI(
      <TaskEditModal task={taskRepo.getById(task.id)} onClose={jest.fn()} onChanged={jest.fn()} />
    );
    expect(taskRepo.getById(task.id)!.completed_at).not.toBeNull();

    // Bir alt görevi geri aç → ana görev de geri açılmalı.
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
    // Hiç alt görev (checkbox) yok; görev kendiliğinden tamamlanmamış kalır.
    expect(queryAllByRole('checkbox')).toHaveLength(0);
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();
  });
});
