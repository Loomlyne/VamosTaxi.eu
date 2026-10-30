---
status: complete
---
# Quick 261030-jbh: summary

GA4 `purchase` now carries `tax` (receipt VAT row, charged bookings only) and one `items` entry (class slug, class name, charged price, quantity 1). Ads conversion and Meta Purchase unchanged.

Checks: unit tests for tracking, types, lint. Not verified: live hit; needs deploy, then one 4242 booking and the `purchase` request read in the browser.
