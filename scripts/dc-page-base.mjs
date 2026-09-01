/**
 * Pretty URLs (`/account`, `/sign-in`, …) keep the address bar and rewrite
 * onto `/app/pages/*.html`. Without a real <base> in <head>, `./support.js`
 * resolves as `/support.js` (404) and the DC template paints raw `{{ }}`.
 *
 * Never treat a `<base ` substring in a script/comment as the tag.
 */
export function splitHead(html) {
  const headOpen = html.match(/<head\b[^>]*>/i);
  if (!headOpen || headOpen.index == null) {
    throw new Error("sync-dc-mock: missing <head>");
  }
  const from = headOpen.index + headOpen[0].length;
  const closeAt = html.toLowerCase().indexOf("</head>", from);
  if (closeAt === -1) {
    throw new Error("sync-dc-mock: missing </head>");
  }
  return {
    before: html.slice(0, from),
    inner: html.slice(from, closeAt),
    after: html.slice(closeAt),
  };
}

function realBaseHref(headInner) {
  const withoutComments = headInner.replace(/<!--[\s\S]*?-->/g, "");
  const match = withoutComments.match(/<base\s+href="([^"]*)"/i);
  return match ? match[1] : null;
}

export function injectBaseInto(html, href) {
  const parts = splitHead(html);
  const existing = realBaseHref(parts.inner);
  if (existing) {
    if (existing !== href) {
      throw new Error(
        `sync-dc-mock: <base href="${existing}"> expected "${href}"`,
      );
    }
    return html;
  }
  return `${parts.before}\n<base href="${href}">${parts.inner}${parts.after}`;
}

export function assertHeadBase(html, href, label) {
  const { inner } = splitHead(html);
  const found = realBaseHref(inner);
  if (!found) {
    throw new Error(
      `sync-dc-mock: ${label} <head> has no <base href> — pretty URLs will paint raw {{ }} (support.js 404)`,
    );
  }
  if (found !== href) {
    throw new Error(
      `sync-dc-mock: ${label} <base href="${found}"> expected "${href}"`,
    );
  }
}
