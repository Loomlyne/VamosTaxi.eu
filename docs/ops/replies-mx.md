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

Note: Resend receiving in region `ap-northeast-1` **is** that SES inbound hostname. Copied from Resend GET domain — not guessed. Rolling back receiving MX means restoring this same value.

## Applied records (copied from Resend GET domain `replies.vamostaxi.site`)

Zone: `vamostaxi.site` only. Region: `ap-northeast-1` (same as sending domain `vamostaxi.site`).

| Name | Type | Priority | Content | Status at apply |
|------|------|----------|---------|-----------------|
| `resend._domainkey.replies` | TXT | — | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1Ie/F0ieMU8/a7i0bDW74UcchCjEH1TT7/t90EjRv3QIaCiFSeLzAY6yboVIG5+5OxT/AWbSfF/qVZD3Ux4GLEFMVNvOcdvdBPUd82shu5MlFewzE+ktwbtf4B9iPZNN4QRZj7zMoARQAmk6exMuQJ/E7MwuPbDm4gLBAIbwy3QIDAQAB` | verified (pre-existing) |
| `replies` | MX | 10 | `inbound-smtp.ap-northeast-1.amazonaws.com` | verified receiving (Resend receiving MX in this region) |
| `send.replies` | MX | 10 | `feedback-smtp.ap-northeast-1.amazonses.com` | applied 2026-09-18 |
| `send.replies` | TXT | — | `v=spf1 include:amazonses.com ~all` | applied 2026-09-18 |

Capabilities after apply: sending=enabled, receiving=enabled.

Public `dig` 2026-09-18 (Cloudflare `1.1.1.1`):

- `replies.vamostaxi.site` MX = `10 inbound-smtp.ap-northeast-1.amazonaws.com.`
- `vamostaxi.site` MX = empty
- `vamostaxi.eu` MX = `10 mail.vamostaxi.eu.`
- `send.replies.vamostaxi.site` MX = `10 feedback-smtp.ap-northeast-1.amazonses.com.`
- `send.replies.vamostaxi.site` TXT = `v=spf1 include:amazonses.com ~all`

Webhook unchanged: `https://vamostaxi.site/api/webhooks/resend` (`email.received` only).

## Flag

Still **false** after this plan. 16-03 flips only after Resend sending status is Verified.
