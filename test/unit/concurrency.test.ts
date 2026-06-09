import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter } from "../../src/odata/concurrency.js";

describe("ConcurrencyLimiter", () => {
  it("bounds concurrent holders and hands slots to waiters", async () => {
    const limiter = new ConcurrencyLimiter(2);
    const r1 = await limiter.acquire("k", 2);
    const r2 = await limiter.acquire("k", 2);

    let thirdAcquired = false;
    const third = limiter.acquire("k", 2).then((release) => {
      thirdAcquired = true;
      return release;
    });

    // With both slots held, the third acquire must be pending.
    await new Promise((r) => setTimeout(r, 10));
    expect(thirdAcquired).toBe(false);

    r1();
    const r3 = await third;
    expect(thirdAcquired).toBe(true);

    r2();
    r3();
  });

  it("release is idempotent (single-use)", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const release = await limiter.acquire("k", 1);
    release();
    release(); // no-op
    // Should be able to acquire again immediately.
    const again = await limiter.acquire("k", 1);
    again();
  });
});
