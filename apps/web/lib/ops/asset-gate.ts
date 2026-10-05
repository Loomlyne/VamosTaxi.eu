// apps/web/lib/ops/asset-gate.ts
//
// The dashboard screen files (`/app/ops/*`: ops.dc.html, OpsDetail, OpsSettings, support.js…) on the
// dashboard host. They are served from the assets binding by the `Dashboard` entrypoint, before
// OpenNext, so the middleware's staff gate never saw them and anyone signed out could read every
// screen's code. Now a file is served only to a request whose session passes the console rule the
// dashboard documents use (`dashboardConsoleAllowed`, shared with middleware.ts), except the exact
// files the sign-in page loads before anyone has signed in. Everything else answers the same private
// 404 the public host gives (`opsAssetNotFound`).

import { opsAssetNotFound, serveOpsAsset } from "../dc-mock-urls";
import { createRequestSupabaseClient } from "../supabase/request";
import { dashboardConsoleAllowed, type StaffAuthClient } from "./session";

/**
 * The files `/login` (ops-login.dc.html, inlined by the middleware) fetches under `/app/ops/` before
 * sign-in: the DC runtime its helmet loads (`./support.js`) and the one component it imports
 * (`<dc-import name="AuthForm">`). Exact paths, nothing else: the page itself is read server-side
 * from the assets binding, and every other file there is needed only after sign-in.
 * Frozen array, not a module-scope Set (no module-scope collections in apps/web).
 */
export const OPS_LOGIN_ASSETS: readonly string[] = Object.freeze([
  "/app/ops/support.js",
  "/app/ops/AuthForm.dc.html",
]);

export function isOpsLoginAsset(pathname: string): boolean {
  return OPS_LOGIN_ASSETS.includes(pathname);
}

export type OpsAssetGateEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

/**
 * Whether this request's session may read a gated screen file, and any cookies a session refresh
 * produced (they ride on the answer either way). No session cookie: no network call. With one: one
 * `GET /auth/v1/user` to Supabase Auth (getUser), the same call the dashboard documents make, plus a
 * token refresh when the access token has expired. No database query from the Worker.
 */
export async function opsAssetSession(
  request: Request,
  env: Pick<OpsAssetGateEnv, "SUPABASE_URL" | "SUPABASE_ANON_KEY">,
): Promise<{ allowed: boolean; setCookies: string[] }> {
  const client = createRequestSupabaseClient(request, {
    url: env.SUPABASE_URL ?? process.env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
  });
  if (!client) return { allowed: false, setCookies: [] };
  let allowed = false;
  try {
    allowed = await dashboardConsoleAllowed(client.supabase as unknown as StaffAuthClient);
  } catch {
    // An auth error the client throws (a malformed token, Auth unreachable): fail closed.
    allowed = false;
  }
  return { allowed, setCookies: client.setCookies };
}

/**
 * Cache rule for a screen file the gate let through (U8b, 2026-10-05). It was `private, no-store`, so
 * every screen change re-downloaded the whole file. `private, no-cache` keeps a copy in this browser
 * only (`private`: no shared cache, no CDN) and makes it ask first: the request comes back to this
 * gate, the session is checked again, and the assets binding answers 304 when the ETag still matches.
 * A signed-out request therefore never gets the stored copy, it gets the 404 below.
 * Anything that is not a served file or a 304 (the 404s) stays `private, no-store`.
 */
export function gatedAssetCacheControl(status: number): string {
  return status === 200 || status === 304 ? "private, no-cache" : "private, no-store";
}

/**
 * Answer a `/app/ops/*` request on the dashboard host (worker.ts, after `guardOpsAsset`).
 *   - an allow-listed sign-in file: served as before, no session needed;
 *   - any other path: served only when `dashboardConsoleAllowed` passes, `private, no-cache` with the
 *     asset's ETag (the browser's conditional request goes through the same check); otherwise the
 *     private no-store 404 (`opsAssetNotFound`), identical to the public host's.
 */
export async function serveGatedOpsAsset(request: Request, env: OpsAssetGateEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (isOpsLoginAsset(pathname)) return serveOpsAsset(request, env.ASSETS);
  const session = await opsAssetSession(request, env);
  const res = session.allowed ? await serveOpsAsset(request, env.ASSETS) : opsAssetNotFound();
  const headers = new Headers(res.headers);
  headers.set("cache-control", gatedAssetCacheControl(res.status));
  for (const line of session.setCookies) headers.append("Set-Cookie", line);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
