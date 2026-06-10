import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// server-only guard uses a Next.js internal; stub it so the import succeeds in Vitest.
vi.mock('server-only', () => ({}));

// The module uses a module-level Map that persists between tests.
// Re-import with a fresh module state on each test by using vi.resetModules().
let checkRateLimit: typeof import('@/lib/server/rateLimit').checkRateLimit;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ checkRateLimit } = await import('@/lib/server/rateLimit'));
});

afterEach(() => {
  vi.useRealTimers();
});

const WINDOW_MS = 60_000; // 1 minute for test brevity
const MAX = 3;

describe('checkRateLimit', () => {
  it('allows requests below the limit', () => {
    for (let i = 0; i < MAX; i++) {
      expect(checkRateLimit('uid:ep', MAX, WINDOW_MS).allowed).toBe(true);
    }
  });

  it('blocks the (max + 1)-th request within the window', () => {
    for (let i = 0; i < MAX; i++) {
      checkRateLimit('uid:ep', MAX, WINDOW_MS);
    }
    const result = checkRateLimit('uid:ep', MAX, WINDOW_MS);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('returns retryAfterSeconds close to the remaining window time', () => {
    // Fill the window at t=0
    for (let i = 0; i < MAX; i++) {
      checkRateLimit('uid:ep', MAX, WINDOW_MS);
    }
    // Advance 10 seconds — the oldest slot expires in WINDOW_MS - 10s = 50s
    vi.advanceTimersByTime(10_000);
    const result = checkRateLimit('uid:ep', MAX, WINDOW_MS);
    expect(result.allowed).toBe(false);
    // Should be ~50 seconds (ceil of remaining ms)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(49);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(51);
  });

  it('allows requests again after the window expires', () => {
    for (let i = 0; i < MAX; i++) {
      checkRateLimit('uid:ep', MAX, WINDOW_MS);
    }
    // Blocked now
    expect(checkRateLimit('uid:ep', MAX, WINDOW_MS).allowed).toBe(false);

    // Advance past the full window — all timestamps have expired
    vi.advanceTimersByTime(WINDOW_MS + 1);

    expect(checkRateLimit('uid:ep', MAX, WINDOW_MS).allowed).toBe(true);
  });

  it('tracks separate keys independently', () => {
    // Exhaust the limit for key A
    for (let i = 0; i < MAX; i++) {
      checkRateLimit('userA:ep', MAX, WINDOW_MS);
    }
    expect(checkRateLimit('userA:ep', MAX, WINDOW_MS).allowed).toBe(false);

    // Key B is completely independent — should still be allowed
    expect(checkRateLimit('userB:ep', MAX, WINDOW_MS).allowed).toBe(true);
  });
});
