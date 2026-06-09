/**
 * Per-key counting semaphore bounding the number of concurrent in-flight
 * requests to each SAP system (default ≤15) to avoid triggering throttling.
 *
 * On release, if a waiter is queued the held slot is transferred directly to it
 * (the active count is unchanged); otherwise the count is decremented.
 */
export class ConcurrencyLimiter {
  private readonly active = new Map<string, number>();
  private readonly waiters = new Map<string, Array<() => void>>();

  constructor(private readonly defaultMax: number = 15) {}

  /** Acquire a slot for `key`; resolves to a single-use release function. */
  async acquire(key: string, max?: number): Promise<() => void> {
    const limit = max ?? this.defaultMax;
    const current = this.active.get(key) ?? 0;

    if (current < limit) {
      this.active.set(key, current + 1);
    } else {
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(key) ?? [];
        queue.push(resolve);
        this.waiters.set(key, queue);
      });
      // Slot was transferred to us by release(); active count already accounts for it.
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(key);
    };
  }

  private release(key: string): void {
    const queue = this.waiters.get(key);
    const next = queue?.shift();
    if (next) {
      // Transfer the held slot to the next waiter — active count unchanged.
      next();
      return;
    }
    const current = this.active.get(key) ?? 1;
    this.active.set(key, Math.max(0, current - 1));
  }
}
