// apps/web/lib/checkout/rate-limit-retry.ts
//
// Quick 261003: "Too many prices in a short time — wait a moment and try again" asks the
// customer to wait. /checkout asks for the price again by itself ONCE, after the 60 s
// Worker rate-limit window, so a customer who waits sees prices without pressing anything.
//
// Rules (each is a test in rate-limit-retry.test.ts):
// - one automatic retry per page, never a loop against the limiter;
// - TRY AGAIN cancels it for good (the customer has taken over);
// - a newer quote (trip change, TRY AGAIN, another result) skips a pending retry;
// - a result that is not rate_limited cancels a pending retry;
// - unmount clears the timer.

/** Long enough that the 60 s rate-limit window has rolled over. */
export const RATE_LIMIT_RETRY_MS = 61_000;

export type RateLimitAutoRetry = {
  /** A quote started as request `seq` settled; `code` is its error code, or null when it priced. */
  settled(code: string | null, seq: number): void;
  /** The customer pressed TRY AGAIN: no automatic retry any more on this page. */
  manualRetry(): void;
  /** Unmount. */
  dispose(): void;
};

export type RateLimitAutoRetryDeps = {
  /** The newest quote request number; a retry runs only if nothing newer started. */
  currentSeq: () => number;
  /** Ask for the price again (the caller shows the loading state and re-arms with settled()). */
  retry: () => void;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
};

export function createRateLimitAutoRetry(deps: RateLimitAutoRetryDeps): RateLimitAutoRetry {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const delay = deps.delayMs ?? RATE_LIMIT_RETRY_MS;
  let used = false;
  let timer: unknown = null;

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    settled(code, seq) {
      if (seq !== deps.currentSeq()) return;
      cancel();
      if (code !== "rate_limited" || used) return;
      timer = setTimer(() => {
        timer = null;
        if (used || deps.currentSeq() !== seq) return;
        used = true;
        deps.retry();
      }, delay);
    },
    manualRetry() {
      used = true;
      cancel();
    },
    dispose() {
      cancel();
    },
  };
}
