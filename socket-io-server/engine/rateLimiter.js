function createRateLimiter({ tokensPerInterval = 5, intervalMs = 10_000, bucketSize = 5 } = {}) {
  const buckets = new Map(); // key -> { tokens, last }

  return {
    allow(key) {
      const now = Date.now();
      let b = buckets.get(key);
      if (!b) {
        b = { tokens: tokensPerInterval, last: now };
        buckets.set(key, b);
      }

      const elapsed = now - b.last;
      if (elapsed > 0) {
        const refill = (elapsed / intervalMs) * tokensPerInterval;
        b.tokens = Math.min(bucketSize, b.tokens + refill);
        b.last = now;
      }

      if (b.tokens >= 1) {
        b.tokens -= 1;
        return true;
      }
      return false;
    },
  };
}

module.exports = { createRateLimiter };
