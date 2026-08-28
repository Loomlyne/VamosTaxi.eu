// apps/web/lib/quote/preprocess.ts
//
// D-04: widget tokens are preprocessed BEFORE the strict zod union.
// `one-way` becomes `one_way`. `hourly` is a product answer
// (`mode_not_offered`), not `400 untrusted_input` — the customer asked a
// reasonable question and there is no hourly_rates table to answer it from
// (D-03, U50). `hours` is left in place so the unknown-key / forbidden-field
// walk rejects it.

export type PreprocessOk = { ok: true; body: Record<string, unknown> };
export type PreprocessErr = {
  ok: false;
  code: "mode_not_offered" | "untrusted_input";
};
export type PreprocessResult = PreprocessOk | PreprocessErr;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Named D-04 step. Not an inline `replace` in the handler.
 */
export function preprocessWidgetTokens(body: unknown): PreprocessResult {
  if (!isPlainObject(body)) {
    return { ok: false, code: "untrusted_input" };
  }
  const mode = body.mode;
  if (mode === "hourly") {
    return { ok: false, code: "mode_not_offered" };
  }
  const next: Record<string, unknown> = { ...body };
  if (mode === "one-way") {
    next.mode = "one_way";
  }
  return { ok: true, body: next };
}
