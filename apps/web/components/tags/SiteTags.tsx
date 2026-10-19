// Owner's tags (2026-10-19): Google Tag Manager, Google tag (GA4), Meta Pixel, verbatim.
// Owner 2026-10-19: every visit counts whatever the banner choice, so nothing here waits for consent.
// The mock pages get the same block from scripts/dc-page-base.mjs (TAGS_HEAD / TAGS_BODY).

const GTM = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-KPKGT4VH');`;

const GTAG = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-K5MZME44P6');
`;

const META = `
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
`;

/** Head block: GTM, gtag.js, Meta Pixel. */
export function SiteTagsHead() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: GTM }} />
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-K5MZME44P6" />
      <script dangerouslySetInnerHTML={{ __html: GTAG }} />
      <script dangerouslySetInnerHTML={{ __html: META }} />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src="https://www.facebook.com/tr?id=1595596972063765&ev=PageView&noscript=1"
        />
      </noscript>
    </>
  );
}

/** GTM noscript, first thing in <body>. */
export function SiteTagsBody() {
  return (
    <noscript>
      <iframe
        src="https://www.googletagmanager.com/ns.html?id=GTM-KPKGT4VH"
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
