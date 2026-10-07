// "Local data is about to be replaced wholesale" — an account merge (new ids)
// or clearing local data. In-memory holders of row ids must react first: a
// running timer kept an old habit id and its next commit crashed on a foreign
// key. Listeners run SYNCHRONOUSLY, BEFORE the change, while the old ids still exist.

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
