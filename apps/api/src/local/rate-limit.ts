interface WindowCounter {
  count: number;
  startedAt: number;
}

export function createLocalRateLimiter(limit: number, periodMs: number): RateLimit {
  const counters = new Map<string, WindowCounter>();
  let callsSinceCleanup = 0;

  return {
    async limit({ key }) {
      const now = Date.now();
      const current = counters.get(key);
      const counter =
        current && now - current.startedAt < periodMs
          ? current
          : { count: 0, startedAt: now };

      counter.count += 1;
      counters.set(key, counter);

      callsSinceCleanup += 1;
      if (callsSinceCleanup >= 128) {
        for (const [storedKey, storedCounter] of counters) {
          if (now - storedCounter.startedAt >= periodMs) {
            counters.delete(storedKey);
          }
        }
        callsSinceCleanup = 0;
      }

      return { success: counter.count <= limit };
    },
  };
}
