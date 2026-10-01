// A friend checking off a task shared WITH them. This is the recipient's ONLY
// write path (tasks RLS keeps UPDATE owner-only): the server flips completion
// and nothing else, then returns the row's new values so the local copy can
// mirror them without being queued for push.

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
