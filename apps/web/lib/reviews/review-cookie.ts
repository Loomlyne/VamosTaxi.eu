import { NextResponse, type NextRequest } from "next/server";

/**
 * The review link's token is a secret (owner 2026-10-04, "hide all tokens"). Like the manage
 * link (K100, vt_manage), GET /review?token=… is answered with a 302 to /review and the token
 * moves into an HttpOnly cookie scoped to /review, so the address bar, history, Referer and
 * analytics never hold it, and a refresh or language switch still finds it.
 */
export const REVIEW_COOKIE_NAME = "vt_review";

/** 30 days: the review token itself never expires; a month covers "review later" from the e-mail. */
export const REVIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Path the review page lives on; the cookie is sent nowhere else. */
export const REVIEW_PATH = "/review";

/**
 * The 302 that strips `token` from a review link and keeps it in `vt_review`, or null when
 * the request is not a review link with a token. `path` is the locale-stripped pathname.
 */
export function reviewTokenRedirect(request: NextRequest, path: string): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (path !== REVIEW_PATH) return null;
  const token = (request.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete("token");
  const res = NextResponse.redirect(url, 302);
  res.cookies.set(REVIEW_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: REVIEW_PATH,
    maxAge: REVIEW_COOKIE_MAX_AGE,
  });
  return res;
}

/** The token for the review page: the query value if one is still there, else the cookie. */
export function reviewTokenFor(queryToken: unknown, cookieValue: string | undefined): string {
  const q = typeof queryToken === "string" ? queryToken.trim() : "";
  if (q) return q;
  return (cookieValue ?? "").trim();
}
