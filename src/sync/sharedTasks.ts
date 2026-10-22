// What a person a task is shared WITH can do — their only write paths (RLS keeps
// UPDATE owner-only): tick a task or subtask, add an item, remove an item (a
// shopping list). The server decides and returns the new values, which the local
// copy mirrors without being queued for push.

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
  // Cloud uid of whoever ticked it (the caller, when completing).
  completedBy: string | null;
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
      completedBy: data.completed_by ?? null,
    };
  } catch (e) {
    throw toSharingError(e);
  }
}

export interface SharedSubtaskAdded {
  subtaskId: string;
  title: string;
  position: number;
  subtaskUpdatedAt: string;
  taskId: string;
  // An item makes a finished task open again.
  taskCompletedAt: string | null;
  taskUpdatedAt: string;
}

export async function addSharedSubtask(taskId: string, title: string): Promise<SharedSubtaskAdded> {
  try {
    if (!supabase) throw new SharingError('ERK_AUTH');
    const { data, error } = await supabase.rpc('add_shared_subtask', { p_task_id: taskId, p_title: title });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    if (!data?.subtask_id || !data?.subtask_updated_at || !data?.task_updated_at) {
      throw new SharingError('ERK_UNKNOWN', 'empty add result');
    }
    return {
      subtaskId: data.subtask_id,
      title: data.title,
      position: data.position,
      subtaskUpdatedAt: data.subtask_updated_at,
      taskId: data.task_id,
      taskCompletedAt: data.task_completed_at ?? null,
      taskUpdatedAt: data.task_updated_at,
    };
  } catch (e) {
    throw toSharingError(e);
  }
}

export interface SharedSubtaskRemoved {
  subtaskUpdatedAt: string;
  taskId: string;
  taskCompletedAt: string | null;
  taskUpdatedAt: string;
}

export async function deleteSharedSubtask(subtaskId: string): Promise<SharedSubtaskRemoved> {
  try {
    if (!supabase) throw new SharingError('ERK_AUTH');
    const { data, error } = await supabase.rpc('delete_shared_subtask', { p_subtask_id: subtaskId });
    if (error) throw error;
    if (data?.error) throw new SharingError(toSharingError(data.error).code);
    if (!data?.subtask_updated_at || !data?.task_updated_at || !data?.task_id) {
      throw new SharingError('ERK_UNKNOWN', 'empty delete result');
    }
    return {
      subtaskUpdatedAt: data.subtask_updated_at,
      taskId: data.task_id,
      taskCompletedAt: data.task_completed_at ?? null,
      taskUpdatedAt: data.task_updated_at,
    };
  } catch (e) {
    throw toSharingError(e);
  }
}

export interface TaskParticipant {
  id: string;
  displayName: string | null;
  isOwner: boolean;
}

// Everyone a shared task involves (owner included), for "who ticked it". They
// need not be friends of each other, so names come from the server. Best
// effort: offline, callers fall back to the friends cache.
export async function getTaskParticipants(taskId: string): Promise<TaskParticipant[]> {
  try {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('get_task_participants', { p_task_id: taskId });
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => ({ id: r.user_id, displayName: r.display_name ?? null, isOwner: !!r.is_owner }));
  } catch {
    return [];
  }
}
