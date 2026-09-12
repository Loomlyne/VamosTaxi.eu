# WAF sitting notes — vamostaxi.site

Owner clicks in the Cloudflare dashboard. Not the customer runbook. Not
Terraform. Not wrangler. English. No screenshots. No secrets. No invented CHF.

Zone **vamostaxi.site** only. Hostnames on this zone: `vamostaxi.site`,
`www.vamostaxi.site`, `dashboard.vamostaxi.site`. One zone WAF covers all three.

Stripe HMAC in the Worker (`constructEventAsync`) stays the only webhook gate.
Do not add Turnstile on `/api/stripe/webhook`.

## Must nots

1. Do not open a vamostaxi.eu zone. Do not bind it. Do not enable WAF there.
2. Do not country-block dashboard. Staff sign in from anywhere.
3. Do not add WAF on workers.dev. That hostname is not a customer site.
4. Do not add a checkout captcha — no Turnstile wall, no Managed Challenge on
   `/checkout` or pay.
5. If a real quote or pay returns 403 from WAF, disable or loosen that managed
   rule. Funnel wins.

## 1. Open the zone

1. Open https://dash.cloudflare.com
2. Sign in to the Vamos account.
3. Click the zone named **vamostaxi.site**.
4. Expected screen text: the zone overview for **vamostaxi.site**. You should
   see this zone’s hostnames include vamostaxi.site, www, and dashboard.
5. If the zone name is anything else, stop.

## 2. Enable managed WAF

1. Left sidebar: **Security** → **WAF**.
2. Expected screen text: **Managed rules** (tab or heading). If the sidebar
   says **Security rules** instead of **WAF**, open that — same place.
3. Open **Managed rules**.
4. Find **Cloudflare Managed Ruleset**.
5. If the control says **Deploy**, click **Deploy**. Expected: status
   **Enabled**.
6. If it already says **Enabled**, leave it. Do not toggle it off and on.
7. Do not create a country block on this screen, under IP Access Rules, or as
   a custom rule on `dashboard.vamostaxi.site`.

## 3. Skip `/api/stripe/webhook`

WAF must not challenge Stripe. The skip path is exactly `/api/stripe/webhook`.

1. Stay in **Security** → **WAF**.
2. Open **Custom rules**.
3. Click **Create rule**.
4. Rule name: `Skip Stripe webhook`.
5. Click **Edit expression**.
6. Paste exactly: `(http.request.uri.path eq "/api/stripe/webhook")`
7. Or the field builder: Field **URI Path**, operator **equals**, value
   `/api/stripe/webhook`.
8. Choose action **Skip**.
9. Under WAF components to skip, tick **Managed rules**. If **Bot Fight Mode**
   or **Super Bot Fight Mode** appear, tick those too — Stripe is not a
   browser.
10. Click **Deploy**.
11. Expected: the rule is **Enabled**. If it is not first in the custom rules
    list, move it to the **top**.

## 4. Confirm www and dashboard are this zone

1. Stay on zone **vamostaxi.site**. Do not switch zone.
2. Open **DNS** (or Overview).
3. Expected: records for the apex, **www**, and **dashboard** on this zone.
4. Do not add those names on another zone.

## 5. If quote or pay is blocked

Funnel wins. No checkout captcha wall.

1. **Security** → **Events** (or Security → Analytics → Events).
2. Find the 403. Read the managed rule name.
3. **Managed rules** → that rule → **Disable**, or set it to **Log**.
4. Retry the quote or pay until it returns a product response.
5. Do not add Turnstile or a Managed Challenge on checkout to “fix” it.

## Done when

- Cloudflare Managed Ruleset is **Enabled** on vamostaxi.site.
- A custom **Skip** exists for URI path equals `/api/stripe/webhook`.
- Public quote still returns a product response.
- A test Stripe webhook delivery is not 403 from WAF.

LAUNCH-02 WAF is not live until that skip exists.
