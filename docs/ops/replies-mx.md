# replies.vamostaxi.site — Resend MX runbook

Phase 16-02. Receiving + sending DNS for the plus-address host only.
Apex `vamostaxi.site` and zone `vamostaxi.eu` are never written here.

## Snapshot (2026-09-18, before cutover)

| Host | MX |
|------|----|
| `replies.vamostaxi.site` | `10 inbound-smtp.ap-northeast-1.amazonaws.com.` |
| `vamostaxi.site` (apex) | *(empty — do not add)* |
| `vamostaxi.eu` | `10 mail.vamostaxi.eu.` |

`REPLIES_DOMAIN_VERIFIED` in `apps/web/lib/ops/ticket-mail.ts` is **false**. Do not flip in this plan.

Webhook (reuse, do not mint): `https://vamostaxi.site/api/webhooks/resend`

## Rollback (D-08) — restore SES **before** deleting it

If inbound never arrives after the Resend MX cut:

1. Cloudflare zone `vamostaxi.site` only.
2. MX on name `replies`:
   - type: `MX`
   - name: `replies`
   - priority: `10`
   - content: `inbound-smtp.ap-northeast-1.amazonaws.com`
3. Delete leftover Resend MX on `replies` so there is not dual MX.
4. Do not add apex MX. Do not touch `vamostaxi.eu`.
5. Leave `REPLIES_DOMAIN_VERIFIED = false` unless 16-03 already flipped it after Verified.

## Applied records

*(filled after Resend returns copy-paste records — never guessed)*

## Flag

Still **false** after this plan.
