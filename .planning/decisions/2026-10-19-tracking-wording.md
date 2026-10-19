# Google and Meta lines for /cookies and /privacy — APPROVED by the owner 2026-10-19

Status: **approved as written** (owner, 2026-10-19). English verbatim on the site; de / fr / ar translated in the same pass (Swiss German, "ss"). The cookie banner's Marketing line reuses the approved words: "Measures whether our adverts on Google, Facebook and Instagram lead to bookings."

What the site does today (checked live 2026-10-19, Worker 5096af41):
- Before a choice, or after "Only necessary": no Google or Meta cookie is set. Google receives a cookieless
  "page viewed" signal marked *consent denied* (Google Consent Mode). Meta receives nothing.
- Analytics on: Google Analytics sets `_ga` and `_ga_K5MZME44P6`.
- Marketing on: Google's advertising signals are allowed and the Meta Pixel sets `_fbp` and sends page views.

---

## /cookies

### 05 Analytics — replaces the section text and table

Intro:
> Which pages people visit and which step of a booking they give up on. Aggregated, and never used to make a decision about you.

| Name | Purpose | Provider | Duration |
|---|---|---|---|
| No cookie | Counts visits and measures where a booking is abandoned | Cloudflare Web Analytics (cookieless) | Nothing is stored in your browser |
| `_ga` · `_ga_K5MZME44P6` | Tells one visit from another so we can count visitors and pages | Google Analytics · Google Ireland Ltd | 2 years |

Line under the table:
> Until you allow Analytics, Google receives only a signal that a page was viewed, with no cookie and no identifier.

### 06 Marketing — replaces "Nothing in this category is running today…"

Intro:
> Measures whether our adverts on Google, Facebook and Instagram lead to bookings, and lets us show our adverts to people who visited the site. Off until you allow it.

| Name | Purpose | Provider | Duration |
|---|---|---|---|
| `_fbp` | Links your visit to our adverts on Facebook and Instagram | Meta Pixel · Meta Platforms Ireland Ltd | 90 days |
| Google advertising signals | Measures our Google adverts and builds advertising audiences | Google Tag Manager · Google Ireland Ltd | Up to 2 years |

## /privacy

### 02 What we collect — replaces the sentence "We do not buy data about you and we do not build advertising profiles."
> We do not buy data about you. If you allow Marketing cookies, Google and Meta use your visit to measure and show our adverts.

### 04 Who processes it — two new supplier rows (after "Cloudflare Web Analytics")
> **Google Ireland Ltd** — Site analytics and advert measurement, only with your consent · Dublin, Ireland; Google LLC, United States
>
> **Meta Platforms Ireland Ltd** — Advert measurement on Facebook and Instagram, only with your consent · Dublin, Ireland; Meta Platforms Inc., United States

### 05 Transfers abroad — one new line
> Google and Meta may process data in the United States. Both are certified under the EU–US and Swiss–US Data Privacy Framework, and their standard contractual clauses apply as well.

---

Approved with it: the cookieless Google signal before consent (Consent Mode, advanced) stays on. The adviser may still review the Data Privacy Framework line.
