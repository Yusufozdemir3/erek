// "Local data is about to be replaced wholesale" signal — account merge
// (every id is regenerated) and clearing local data (account replace / erase
// from Profile).
//
// WHY: in-memory state that holds row ids outlives such a change. The running
// timer was the concrete case: it kept the OLD habit id, and pausing it after a
// merge inserted a habit_log for a habit that no longer existed -> FOREIGN KEY
// failure inside a press handler -> app crash in a release build.
//
// Listeners run SYNCHRONOUSLY, BEFORE the change: the timer commits its
// running seconds while the old ids are still valid (after a merge they then
// carry over under the new ids along with everything else).

type Listener = () => void;

const listeners = new Set<Listener>();

export function onLocalDataWillChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitLocalDataWillChange(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch (e) {
      // A listener must never block the data change itself.
      console.warn('[LocalData] listener failed:', e);
    }
  }
}
