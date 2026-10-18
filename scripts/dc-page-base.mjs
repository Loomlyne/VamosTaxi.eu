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

/**
 * The consent runtime, straight after <base>, so it runs while the page parses rather than once React, Babel and
 * the CookieBanner component have loaded. The file returns early when its global already exists, so the
 * CookieBanner helmet loading it again later is a no-op. Only pages that mount CookieBanner get it.
 * 2026-10-18: the Meta and Google loaders that used to sit here were removed with every tag.
 */
export const TRACKING_HEAD = '<script src="/app/vamos-consent.js"></script>';

export function injectTrackingInto(html) {
  if (!/<dc-import\s+name="CookieBanner"/.test(html)) return html;
  const parts = splitHead(html);
  if (parts.inner.includes(TRACKING_HEAD)) return html;
  const withoutComments = parts.inner.replace(/<!--[\s\S]*?-->/g, "");
  const base = withoutComments.match(/<base\s+href="[^"]*">/i);
  if (!base) throw new Error("sync-dc-mock: tracking needs <base> first");
  const at = parts.inner.indexOf(base[0]) + base[0].length;
  return `${parts.before}${parts.inner.slice(0, at)}\n${TRACKING_HEAD}${parts.inner.slice(at)}${parts.after}`;
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
