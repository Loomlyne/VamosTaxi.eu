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

/** Google Consent Mode v2, advanced (owner 2026-10-26): default denied before GTM and gtag load; the visitor's saved
 * choice (/api/consent/state) and every `vamos:consent` event update it. Analytics -> analytics_storage, Marketing ->
 * ad_storage, ad_user_data, ad_personalization. Google only: Meta and Cloudflare stay as they are. Same text as
 * CONSENT in apps/web/components/tags/SiteTags.tsx. */
export const CONSENT_HEAD = `<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
(function(){function apply(c){if(!c)return;var a=c.analytics===true,m=c.marketing===true;
gtag('consent','update',{analytics_storage:a?'granted':'denied',ad_storage:m?'granted':'denied',ad_user_data:m?'granted':'denied',ad_personalization:m?'granted':'denied'});}
window.addEventListener('vamos:consent',function(e){apply(e&&e.detail);});
try{fetch('/api/consent/state',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.ok===true&&j.chosen===true)apply(j.choice);},function(){});}catch(e){}})();
</script>
`;

/** Owner's tags (2026-10-19): Google Tag Manager, Google tag (GA4), Meta Pixel, head of every public page, after CONSENT_HEAD. Verbatim except the vendors' marker comments (served pages carry no HTML comments). Google waits for the consent signal (2026-10-26); Meta counts every visit (2026-10-19). */
export const TAGS_HEAD = `${CONSENT_HEAD}<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KPKGT4VH');</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-K5MZME44P6"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-K5MZME44P6');
</script>
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1595596972063765');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1595596972063765&ev=PageView&noscript=1"
/></noscript>
`;

/** Google Tag Manager (noscript), straight after <body>. */
export const TAGS_BODY = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KPKGT4VH"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
`;

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

/** Owner's tags on a public page (one that mounts CookieBanner): head block right after <head>, GTM noscript after <body>. */
export function injectTagsInto(html) {
  if (!/<dc-import\s+name="CookieBanner"/.test(html)) return html;
  if (html.includes("GTM-KPKGT4VH")) return html;
  const parts = splitHead(html);
  let out = `${parts.before}\n${TAGS_HEAD}${parts.inner}${parts.after}`;
  const body = out.match(/<body\b[^>]*>/i);
  if (!body || body.index == null) throw new Error("sync-dc-mock: tags need <body>");
  const at = body.index + body[0].length;
  return `${out.slice(0, at)}\n${TAGS_BODY}${out.slice(at)}`;
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
