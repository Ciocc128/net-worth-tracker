import 'server-only';

/**
 * In-memory sliding window rate limiter.
 *
 * Design trade-off: per-instance on serverless — each cold start begins from zero,
 * so the effective limit is (maxRequests × number_of_warm_instances). This is
 * deliberately chosen over a distributed solution (Upstash/Redis) because:
 *   1. The app is single-user; the primary abuse mitigation is Firebase auth (SEC-1).
 *   2. This is defense-in-depth against a compromised account or a looping client bug,
 *      not against coordinated distributed abuse.
 *   3. Zero additional dependencies, zero additional failure modes.
 * A distributed limiter would be the right call if the app becomes multi-tenant.
 */

// Map from rate-limit key to an array of request timestamps (ms) within the current window.
const windowMap = new Map<string, number[]>();

/**
 * Checks whether the caller identified by `key` is within the allowed rate.
 *
 * Uses a sliding window: only timestamps within the last `windowMs` ms are counted.
 * Expired timestamps are pruned lazily on every call (no background timer needed).
 *
 * @param key        Unique key for this caller+endpoint combination (e.g. `${uid}:stream`).
 * @param maxRequests Maximum number of requests allowed in the window.
 * @param windowMs   Duration of the sliding window in milliseconds.
 * @returns `{ allowed: true }` when under the limit, or
 *          `{ allowed: false, retryAfterSeconds }` when the limit is exceeded.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Lazy cleanup: drop timestamps that have already left the window.
  const timestamps = (windowMap.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= maxRequests) {
    // The oldest timestamp in the window determines when a slot frees up.
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    windowMap.set(key, timestamps);
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  windowMap.set(key, timestamps);
  return { allowed: true };
}
