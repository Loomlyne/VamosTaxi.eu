# Quote lock rotation (U58)

Procedure for the dual-verify mechanism D-28 already ships. Public HMAC failure
stays `404 quote_not_found` — this endpoint is not an oracle.
`lock_secret_rotated` is an ops-only log signal.

## Order

Two separate `wrangler secret put` calls, in this order:

1. Put the **new** secret in `QUOTE_LOCK_SECRET`.
2. Move the **old** secret to `QUOTE_LOCK_SECRET_PREVIOUS`.

Never a `vars` entry. Never `NEXT_PUBLIC_`.

## Wait one full lock TTL

Wait **one full lock TTL** (`settings_versions.quote_lock_minutes`, currently
30 minutes) before removing `QUOTE_LOCK_SECRET_PREVIOUS`.

An instant swap mass-expires every checkout in flight. The customers affected
are precisely the ones who were about to pay.

## `VAMOS_QS_SECRET`

Same shape. Blast radius is a rate-limit bucket, not a checkout. Still two
puts, still one full cookie TTL before dropping the previous secret.
