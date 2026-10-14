// scripts/i18n-proxy-ai.mjs
//
// Phase 32: the AI binding that `getPlatformProxy({ remoteBindings: true })` returns sends `AI.run` over
// devalue RPC, which cannot serialise an AbortSignal ("DevalueError: Cannot stringify arbitrary non-POJOs"),
// so every call with a third argument failed as model_error (controller probe, 2026-10-14 13:55). The real
// Worker binding accepts `{ signal }`, so the product code keeps passing it; only these Node scripts
// (i18n:fill, i18n:smoke) wrap the proxy: `run` drops the options and races the signal on the Node side,
// so a timeout still ends the wait (the remote call itself is not cancelled).

/**
 * Wraps a platform-proxy AI binding so `run(model, input, opts)` never sends `opts` over the proxy.
 * @param {{ run(model: string, input: Record<string, unknown>): Promise<unknown> }} binding
 * @returns {{ run(model: string, input: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<unknown> }}
 */
export function proxyAi(binding) {
  return {
    run(model, input, opts) {
      const signal = opts?.signal;
      if (!signal) return binding.run(model, input);
      if (signal.aborted) return Promise.reject(abortError(signal));
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        binding.run(model, input).then(
          (v) => {
            signal.removeEventListener("abort", onAbort);
            resolve(v);
          },
          (e) => {
            signal.removeEventListener("abort", onAbort);
            reject(e);
          },
        );
      });
    },
  };
}

function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
}
