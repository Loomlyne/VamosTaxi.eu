// apps/web/lib/translate/ai-stub.ts
//
// Test helper: a stand-in for the Workers AI binding, so no test reaches the network (a real call is
// billed even in local runs). Plain object factories: production code never imports vitest through it.

import type { AiLike } from "./translate";

export type StubCall = {
  model: string;
  input: Record<string, unknown>;
  options?: { signal?: AbortSignal };
};

export type StubAi = AiLike & { calls: StubCall[] };

/**
 * A Gemma chat-completions reply carrying `obj` as JSON content. `raw` replaces the content verbatim
 * (for unparsable answers), `finish` and `refusal` set those fields.
 */
export function gemmaReply(
  obj: Record<string, unknown> | null,
  opts: { finish?: string; refusal?: string | null; raw?: string } = {},
) {
  return {
    choices: [
      {
        message: { content: opts.raw ?? JSON.stringify(obj), refusal: opts.refusal ?? null },
        finish_reason: opts.finish ?? "stop",
      },
    ],
  };
}

/** An `AiLike` whose `run` records each call in `calls` and answers with `handler`. */
export function stubAi(
  handler: (model: string, input: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown,
): StubAi {
  const calls: StubCall[] = [];
  return {
    calls,
    async run(model, input, options) {
      calls.push({ model, input, options });
      return handler(model, input, options);
    },
  };
}
