// scripts/i18n-proxy-ai.test.mjs
//
// Phase 32: the proxy wrapper never forwards run() options (devalue cannot serialise an AbortSignal) and
// still ends the wait when the signal aborts. Run: node --test scripts/i18n-proxy-ai.test.mjs

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { proxyAi } from "./i18n-proxy-ai.mjs";

function recorder(answer) {
  const calls = [];
  return {
    calls,
    run(...args) {
      calls.push(args);
      return typeof answer === "function" ? answer() : Promise.resolve(answer);
    },
  };
}

describe("proxyAi", () => {
  it("calls the binding with model and input only, never the options", async () => {
    const b = recorder({ ok: 1 });
    const ac = new AbortController();
    const out = await proxyAi(b).run("m", { x: 1 }, { signal: ac.signal });
    assert.deepEqual(out, { ok: 1 });
    assert.equal(b.calls.length, 1);
    assert.deepEqual(b.calls[0], ["m", { x: 1 }]);
  });

  it("passes through when no options are given", async () => {
    const b = recorder("a");
    assert.equal(await proxyAi(b).run("m", {}), "a");
    assert.deepEqual(b.calls[0], ["m", {}]);
  });

  it("rejects with an abort error when the signal aborts before the answer", async () => {
    const b = recorder(() => new Promise(() => {}));
    const ac = new AbortController();
    const p = proxyAi(b).run("m", {}, { signal: ac.signal });
    ac.abort();
    await assert.rejects(p, (e) => e.name === "AbortError");
  });

  it("rejects at once on an already aborted signal without calling the binding", async () => {
    const b = recorder("a");
    await assert.rejects(proxyAi(b).run("m", {}, { signal: AbortSignal.abort() }), (e) => e.name === "AbortError");
    assert.equal(b.calls.length, 0);
  });

  it("keeps the binding's own error", async () => {
    const b = recorder(() => Promise.reject(new Error("remote down")));
    await assert.rejects(proxyAi(b).run("m", {}, { signal: new AbortController().signal }), /remote down/);
  });
});
