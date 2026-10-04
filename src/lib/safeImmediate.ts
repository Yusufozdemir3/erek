// Guards setImmediate against a Hermes runtime without a microtask queue.
// In some runtimes (the widget's headless one, or one being torn down) RN's
// setImmediate shim calls queueMicrotask, and Hermes throws "Could not enqueue
// microtask because they are disabled in this runtime". Promise continuations
// are scheduled through setImmediate, so the throw both stalls the widget's
// task at its first await and, uncaught, kills the process. Falling back to a
// timer keeps the continuation running (or harmlessly never firing, if the
// runtime really is dead).

type AnyFn = (...args: unknown[]) => unknown;

const g = global as unknown as { setImmediate?: AnyFn; setTimeout: AnyFn };
const original = g.setImmediate;

if (typeof original === 'function') {
  g.setImmediate = (...args: unknown[]) => {
    try {
      return original(...args);
    } catch (e) {
      if (!String((e as Error)?.message).includes('enqueue microtask')) throw e;
      const [callback, ...rest] = args;
      return g.setTimeout(callback, 0, ...rest);
    }
  };
}
