/**
 * Response headers Next's middleware uses to talk to itself and that should never reach a
 * browser. OpenNext leaves `x-middleware-set-cookie` on redirects from middleware, where it
 * repeats every Set-Cookie value (for /manage-booking?token=… that is the manage token).
 * The real Set-Cookie header is untouched. (Reviewer F9, 2026-10-04.)
 */
const INTERNAL = ["x-middleware-set-cookie"] as const;

/** The same response without Next's internal headers; the original object when it has none. */
export function stripInternalHeaders(res: Response): Response {
  if (!INTERNAL.some((h) => res.headers.has(h))) return res;
  const out = new Response(res.body, res);
  for (const h of INTERNAL) out.headers.delete(h);
  return out;
}
