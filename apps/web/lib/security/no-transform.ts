/**
 * Cache-Control `no-transform` for HTML. Cloudflare does not modify a payload
 * whose Cache-Control contains `no-transform` (Web Analytics FAQ), so the zone's
 * automatic beacon injection skips it. Quick task 261020-fh7.
 */

const DEFAULT_VALUE = "private, no-store, no-transform";

/**
 * Adds the `no-transform` directive to a Cache-Control value, keeping existing directives.
 * @param value current Cache-Control header value, or null when absent
 * @returns the value with `no-transform` present exactly once
 */
export function mergeNoTransform(value: string | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_VALUE;
  const has = trimmed.split(",").some((t) => t.trim().toLowerCase() === "no-transform");
  return has ? value! : `${value}, no-transform`;
}

/**
 * Returns the response with `no-transform` in Cache-Control when it is HTML.
 * Non-HTML responses (and websocket upgrades) are returned as the same object.
 * The body is streamed through, never read.
 * @param res response from a service binding
 * @returns the same response, or a copy with merged Cache-Control
 */
export function withNoTransform(res: Response): Response {
  const type = (res.headers.get("content-type") ?? "").trim().toLowerCase();
  if (!type.startsWith("text/html")) return res;
  if ((res as { webSocket?: unknown }).webSocket) return res;
  const headers = new Headers(res.headers);
  headers.set("cache-control", mergeNoTransform(res.headers.get("cache-control")));
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
