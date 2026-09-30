/**
 * Requests behind CheckoutSignIn (26.5-02). Kept apart from the component so they run
 * under the node test runner, which has no DOM. Every function takes `fetchImpl`, so the
 * dev gallery and the tests can answer without touching /api/auth.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type LinkResult = "sent" | "rate_limited" | "failed";
export type CodeResult = "ok" | "invalid" | "rate_limited" | "failed";

export type LinkRequest = {
  locale: string;
  returnTo: string;
  email: string;
  turnstileToken: string;
};

/**
 * The body of the checkout sign-in link request. The client never sends `createUser`:
 * the server decides by `origin: "checkout"` (26.5-03, T-26.5-08).
 */
export function linkBody(req: LinkRequest) {
  return {
    locale: req.locale,
    returnTo: req.returnTo,
    method: "magic" as const,
    mode: "signin" as const,
    email: req.email,
    origin: "checkout" as const,
    turnstileToken: req.turnstileToken,
  };
}

async function post(fetchImpl: FetchLike, body: unknown): Promise<Response> {
  return fetchImpl("/api/auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Sends (or re-sends) the sign-in link. Each call carries the token it is given. */
export async function requestSignInLink(fetchImpl: FetchLike, req: LinkRequest): Promise<LinkResult> {
  try {
    const res = await post(fetchImpl, linkBody(req));
    if (res.status === 429) return "rate_limited";
    if (!res.ok) return "failed";
    const data = (await res.json().catch(() => null)) as { stage?: string } | null;
    return data?.stage === "sent" ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** Signs in with the 6-digit code from the same email (the shipped verify-code action). */
export async function requestCodeSignIn(
  fetchImpl: FetchLike,
  req: { locale: string; email: string; code: string },
): Promise<CodeResult> {
  try {
    const res = await post(fetchImpl, {
      locale: req.locale,
      mode: "verify-code",
      email: req.email,
      code: req.code,
    });
    if (res.status === 429) return "rate_limited";
    const data = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
    if (res.ok && data?.ok === true) return "ok";
    if (data?.reason === "code-invalid") return "invalid";
    return "failed";
  } catch {
    return "failed";
  }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "empty" and "shape" map to the existing checkout messages; null means send. */
export function emailProblem(email: string): "empty" | "shape" | null {
  const v = email.trim();
  if (!v) return "empty";
  return EMAIL_SHAPE.test(v) ? null : "shape";
}
