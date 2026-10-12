---
id: SEED-002
status: dormant
planted: 2026-10-11
planted_during: v1.3 Meta measurement
trigger_when: when performance, dashboard speed or SEO pages come up
scope: Medium (~25-30 h, one month of the owner's 20-30 h)
pack: 2
needs_first: 1 Measure (to prove the gain)
---

# SEED-002: Speed: compile DC pages at build time, dashboard lists load in pages

## Why This Matters

Public site and dashboard compile JSX in the browser on first load (React, ReactDOM, Babel from unpkg); precompiling is the largest speed win.

## When to Surface

**Trigger:** when performance, dashboard speed or SEO pages come up

Owner works 20-30 h a month and picks one pack at a time; no fixed months (2026-10-11).

## Scope Estimate

**~25-30 h** (rough, AI-assisted). Needs first: 1 Measure (to prove the gain).

Build-time compile of .dc.html; paged dashboard lists; board stays live instead of re-reading all; monthly speed report per page.

## Breadcrumbs

app/support.js; apps/web/public/app (synced mocks)

## Notes

From the long-run discussion of 2026-10-11. Prices, rates, terms and legal wording are the owner's; never invented.
