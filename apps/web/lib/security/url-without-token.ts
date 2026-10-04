/**
 * The same address without its `token` query value, or null when it carries none.
 * Pages that receive a secret link (/review?token=…) call this once on load and
 * `history.replaceState` the result, so the token does not sit in the address bar,
 * the history list or an analytics beacon that records the page address.
 */
export function urlWithoutToken(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!url.searchParams.has("token")) return null;
  url.searchParams.delete("token");
  const q = url.searchParams.toString();
  return `${url.pathname}${q ? `?${q}` : ""}${url.hash}`;
}
