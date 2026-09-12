// apps/web/lib/consent/ip.ts
//
// D-10: last-octet / IPv6 /64 truncation for consent_log.ip_truncated.
// Callers pass CF-Connecting-IP (cf-connecting-ip) — never log the raw IP.

/**
 * Truncate a client IP for consent_log. IPv4 last octet → .0; IPv6 interface
 * identifier zeroed (keep /64). Garbage or empty → null.
 */
export function truncateClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ip = raw.split(",")[0]?.trim() ?? "";
  if (ip.length === 0) return null;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}.${p[2]}.0`;
  }

  if (ip.includes(":")) {
    const parts = ip.split(":");
    // Expand :: once so we can keep the first four hextets (/64).
    while (parts.length < 8) {
      const i = parts.indexOf("");
      if (i < 0) break;
      parts.splice(i, 1, ...Array(9 - parts.length).fill("0"));
    }
    return parts.slice(0, 4).concat(["0", "0", "0", "0"]).join(":");
  }

  return null;
}

/** Prefer Cloudflare's connecting IP; do not fall through to X-Forwarded-For. */
export function cfConnectingIp(headers: { get(name: string): string | null }): string | null {
  const value = headers.get("cf-connecting-ip");
  return value && value.trim().length > 0 ? value.trim() : null;
}
