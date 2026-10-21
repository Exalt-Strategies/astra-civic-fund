// Best-effort, per-instance limiter. Stripe Radar is the real card-testing defence.
const MAX_KEYS = 5000;

function makeLimiter({ limit, windowMs, now = Date.now }) {
  if (!(limit >= 1)) throw new Error('limit must be >= 1');
  if (!(windowMs > 0)) throw new Error('windowMs must be > 0');
  const hits = new Map(); // key -> array of hit timestamps, oldest first

  function evict(t) {
    // Drop keys whose newest hit is outside the window.
    for (const [key, arr] of hits) {
      if (arr.length === 0 || t - arr[arr.length - 1] >= windowMs) hits.delete(key);
    }
    // Still over the cap: drop oldest-inserted keys until back at MAX_KEYS.
    for (const key of hits.keys()) {
      if (hits.size <= MAX_KEYS) break;
      hits.delete(key);
    }
  }

  return function allow(key) {
    const t = now();
    const recent = (hits.get(key) || []).filter(x => t - x < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > MAX_KEYS) evict(t);
    return true;
  };
}

module.exports = { makeLimiter };
