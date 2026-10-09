/**
 * Serialises async operations (M2-D3): check-then-write sequences in a service
 * must not interleave when the UI (or two listeners) call them concurrently.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    // Keep the chain alive even when a task rejects.
    this.tail = next.catch(() => undefined);
    return next;
  }
}
