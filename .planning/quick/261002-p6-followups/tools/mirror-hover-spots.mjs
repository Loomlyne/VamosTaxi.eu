// Hover spot for tools/mirror-check.mjs (--spots mirror-hover-spots.mjs --width 1440): hovers the home
// Services CTA and prints how far its arrow wrapper moved (translateX of [data-svc-cta-arrow]). In Arabic the
// nudge must go to the left (negative), in English to the right; with --reduced-motion it must be 0. The
// x-scale product of the arrow is then checked by mirror-check as usual (still -1 in ar, +1 in en).
export default [
  {
    name: "home-services-hover",
    path: "/",
    widths: [1440],
    setup: async (page, env) => {
      const cta = page.locator("[data-svc-cta]").first();
      await cta.scrollIntoViewIfNeeded();
      await cta.hover();
      await env.wait(300);
      const tx = await page.locator("[data-svc-cta-arrow]").first().evaluate((el) => {
        const m = /^matrix\(([^)]+)\)$/.exec(getComputedStyle(el).transform);
        return m ? Number(m[1].split(",")[4]) : 0;
      });
      console.log(`hover    ${env.lang} ${env.width}  [data-svc-cta-arrow] translateX on hover = ${tx}px`);
    },
  },
];
