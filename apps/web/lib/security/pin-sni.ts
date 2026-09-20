/** Known public hostnames this Worker serves. Do not add `.eu`. */
export const VAMOS_SURFACES = [
  "vamostaxi.site",
  "www.vamostaxi.site",
  "dashboard.vamostaxi.site",
] as const;

type Surface = (typeof VAMOS_SURFACES)[number];

const SURFACES = new Set<string>(VAMOS_SURFACES);

export function sniFromCf(cf: unknown): string | null {
  if (!cf || typeof cf !== "object") return null;
  const raw = (cf as { tlsServerName?: unknown }).tlsServerName;
  if (typeof raw !== "string") return null;
  const host = raw.split(":")[0]?.toLowerCase() ?? "";
  return host.length > 0 ? host : null;
}

/** When TLS SNI and URL host disagree, trust SNI — Host is spoofable on a shared Worker. */
export function pinUrlToSni(url: URL, sni: string | null): URL {
  if (!sni || !SURFACES.has(sni) || !SURFACES.has(url.hostname.toLowerCase())) {
    return url;
  }
  if (url.hostname.toLowerCase() === sni) return url;
  const next = new URL(url.toString());
  next.hostname = sni as Surface;
  return next;
}
