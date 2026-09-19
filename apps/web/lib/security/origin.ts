export const PUBLIC_CSRF_HOSTS = new Set([
  "vamostaxi.site",
  "www.vamostaxi.site",
  "localhost",
]);

/** CSRF (ASVS L1) for cookie-backed public mutations. Missing Origin is deny. */
export function publicOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") {
      if (PUBLIC_CSRF_HOSTS.has(url.hostname)) return true;
      return url.hostname.endsWith(".koussayzayeni.workers.dev");
    }
    return url.protocol === "http:" && url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function csrfForbidden(request: Request): Response | null {
  if (publicOriginAllowed(request.headers.get("Origin"))) return null;
  return Response.json(
    { ok: false, code: "csrf" },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}
