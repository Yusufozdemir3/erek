// A friend checking off a task (or one of its subtasks) shared WITH them. These
// are the recipient's ONLY write paths (tasks/subtasks RLS keeps UPDATE
// owner-only): the server flips completion and nothing else, then returns the
// row's new values so the local copy can mirror them without being queued for push.

import { supabase } from './supabase';
import { SharingError, toSharingError } from './sharingErrors';

export async function toggleSharedTask(
  taskId: string,
  completed: boolean
): Promise<{ completedAt: string | null; updatedAt: string }> {
  try {
    if (!supabase) throw new SharingError('ERK_AUTH');
    const { data, error } = await supabase.rpc('toggle_shared_task', {
      p_task_id: taskId,
      p_completed: completed,
    });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    if (!data?.updated_at) throw new SharingError('ERK_UNKNOWN', 'empty toggle result');
    return { completedAt: data.completed_at ?? null, updatedAt: data.updated_at };
  } catch (e) {
    throw toSharingError(e);
  }
}

export interface SharedSubtaskResult {
  completed: boolean;
  subtaskUpdatedAt: string;
  // The parent task follows its subtasks (all done = done; one reopened =
  // reopened), decided server-side in the same transaction.
  taskId: string;
  taskCompletedAt: string | null;
  taskUpdatedAt: string;
}

export async function toggleSharedSubtask(subtaskId: string, completed: boolean): Promise<SharedSubtaskResult> {
  try {
    if (!supabase) throw new SharingError('ERK_AUTH');
    const { data, error } = await supabase.rpc('toggle_shared_subtask', {
      p_subtask_id: subtaskId,
      p_completed: completed,
    });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    if (!data?.subtask_updated_at || !data?.task_updated_at || !data?.task_id) {
      throw new SharingError('ERK_UNKNOWN', 'empty toggle result');
    }
    return {
      completed: data.completed === 1,
      subtaskUpdatedAt: data.subtask_updated_at,
      taskId: data.task_id,
      taskCompletedAt: data.task_completed_at ?? null,
      taskUpdatedAt: data.task_updated_at,
    };
  } catch (e) {
    throw toSharingError(e);
  }
}
