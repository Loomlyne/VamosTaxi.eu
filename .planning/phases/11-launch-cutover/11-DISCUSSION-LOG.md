# Phase 11: Launch Cutover - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 11-launch-cutover
**Areas discussed:** hostname, go-live order, CHF/OPS Pricing, Freshpage/.eu URLs, sitemap/Google, Stripe, noindex vs 000, OPS gaps, legal source, preview Workers, VAT, extract scope, Publish vs pricing_live, home floors, cookies, locales, sitemap file, www DNS, JSON-LD

---

## Live hostname

| Option | Description | Selected |
|--------|-------------|----------|
| vamostaxi.eu | LAUNCH-05; needs the zone in this Cloudflare account | |
| Keep vamostaxi.site | Worker vamos already serves it | ✓ (this phase) |
| Park for vamostransfer.com | This phase does not cut a customer domain | |

**User's choice:** Forget `.eu` until I say so. Do not force one forever domain. Right now we have `vamostaxi.site` so go with that.
**Notes:** Later domain decided then. Public live on `.site` (drop noindex). Ops stays `dashboard.vamostaxi.site` noindex.

---

## Canonical URL

| Option | Description | Selected |
|--------|-------------|----------|
| https://vamostaxi.site — www 301s to apex | | ✓ (you decide) |
| https://www.vamostaxi.site — apex 301s to www | | |

**User's choice:** You decide — apex canonical, www 301.

---

## Later domain / mail / phone

**Later domain:** Decide then — not this phase.
**Mail:** Keep `*@vamostaxi.site` until you change it.
**Phone:** Keep `+41 79 626 70 82` / `wa.me/41796267082`.

---

## Go-live order

| Option | Description | Selected |
|--------|-------------|----------|
| pricing_live first (real CHF, still test Stripe), then live keys, then sitemap | | ✓ then refined |
| sitemap/index first, then live Stripe, then pricing_live | | |
| live Stripe first, then pricing_live, then sitemap | | |

**User's choice:** pricing_live first, still test Stripe, then live keys, then sitemap.
**Notes:** Later: drop noindex **now** even with CHF 000. Stripe **stays test until owner says** (overrides “live keys this phase”). Sitemap file this phase; Search Console after all V1 phases. One numbered gate, then wait. Daily watch after go-live. Only Worker `vamos`. After live keys: test keys gone from that Worker. Live charge fail: stop taking pay, owner decides. First real charge when owner says.

---

## CHF matrix / OPS Pricing

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for pricing document | | |
| Hosted rate_versions id 5 is the book | | |
| You will Publish in OPS, then we flip | | |
| Other | dashboard.vamostaxi.site/pricing controls every detail | ✓ |

**User's choice:** OPS Pricing page is the only control. Be specific; every calculation on that page. You say the page is right, then we flip — no invented CHF.
**Notes:** One switch: Publish also flips public CHF. Until then CHF 000 everywhere including home floors. Charge always CHF; header converts displayed quote numbers. Night/extras: only published book, sync with booking page. VAT: editable % on OPS Pricing, do not invent a new rate.

---

## Old Freshpage / .eu URLs

| Option | Description | Selected |
|--------|-------------|----------|
| No .eu redirects at all | | ✓ |
| Still 301 old Freshpage paths on .site | | |

**User's choice:** No `.eu` redirects at all.

---

## Sitemap / Google

**Includes:** Public marketing + legal only (home, about, FAQ, contact, legal).
**Never:** `/checkout` `/confirmation` `/bookings` `/account` and anything related to dashboard, also `/account` and `/sign-in`.
**Search Console:** Not this phase — remind after all V1 phases.
**File:** Yes — ship `sitemap.xml`, do not submit.
**JSON-LD:** Not this phase (after explain).

---

## Extract from vamostaxi.eu (content only)

**User's choice:** Extract all we need. `.eu` wins for those fields — still no invented text. EN from `.eu`, translate to de/fr/ar.
**Legal:** Index legal pages with real data — source is extract from `.eu`, not invented.

---

## Cookies / analytics

Keep as now — Cloudflare Web Analytics cookieless, no fake toggles.

---

## Workers

Only Worker `vamos`. “There are no other workers.” Stripe test because it is one Worker.

---

## Claude's Discretion

- Apex canonical, www 301; do not touch DNS unless 301 is broken.
- Implementation of public `CHF 000` while a live `rate_versions` row already exists.

## Deferred Ideas

- `.eu` live host, later domain / `vamostransfer.com`
- Live Stripe keys
- Search Console submit (remind after all V1)
- JSON-LD
- Restore drill after remaining V1; never restore onto `yaumjzvylngfjhtuffqs`
- Phase 13, preview Workers, become-a-partner, Stripe presentment currency
