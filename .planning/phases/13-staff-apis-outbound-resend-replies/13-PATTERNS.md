# Phase 13: Staff APIs + outbound Resend replies - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** 38 (CONTEXT + RESEARCH send path, chrome pass, overlay, Wave 0 tests)
**Analogs found:** 36 / 38

Five analog families. Planner copies these, not a tenth nearby file.

1. **Staff mutating JSON API** — `withStaff` + `jsonErr` + dual-mount re-export
2. **Send-then-insert Resend** — `patchTicket` + `sendContactMessage(..., { allowEmailFallback: false })`
3. **RFC identity** — `ticket-mail.ts` plus-address / `asRfcMessageId` (**CHANGE:** stop minting `Message-ID`)
4. **Email chrome** — `lifecycle-mail.tsx` tokens + `<Img>` wordmark (**CHANGE:** `layout.ts` Arial/180px, `ConfirmationEmail` text lockup)
5. **Ops DC overlay + dual-DC + vitest** — `OpsSupportTicket` in-page `T` + `coupons.test.ts` `asStaff` mock + `notify.test.ts` Resend mock

## Binding caveats (do not reopen)

- **CONTEXT D-01…D-12 wins.** From stays `Vamos Taxi <noreply@vamostaxi.site>` until owner verifies `replies.vamostaxi.site` in Resend. Reply-To is the plus-address now. Do not steal apex MX.
- **Keep PATCH `{ reply }`.** Do not create `POST /api/staff/tickets/:id/reply`. Dual-mount locale route is the implementation; `apps/web/app/api/staff/tickets/[id]/route.ts` re-exports.
- **Fail closed on staff.** No Cloudflare `EMAIL`. No `support_messages` row, no status `replied`, until Resend accepts **and** GET returns RFC `message_id`. Overlay shows generic copy only (`overlayError` / new `sendError`).
- **Ops is DC hash console.** Writer `app/ops/OpsSupportTicket.dc.html`. Run `node scripts/sync-dc-mock-to-public.mjs`. Never hand-edit `apps/web/public/app/`. Overlay copy lives in the in-page `T` object (en/de/fr/ar), **not** `app/vamos-i18n-dict.js`.
- **Brand pass is renderers + skip-send.** Do not reopen quote/checkout/Stripe/`/pricing`. Lifecycle ops copies stay `bookings@vamostaxi.site` (`LIFECYCLE_OPS_EMAIL`). Staff-reply BCC is `SUPPORT_EMAIL` (`info@vamostaxi.site`) only.
- **No new packages.** `resend` already installed (`apps/web` 6.24.0 types `emails.get`). Optional pin-align to 6.26.0 is not required to ship.

### Dead (do not analog as product behavior)

| Dead pattern | Where it lives today | Why dead |
|--------------|----------------------|----------|
| Mint `headers["Message-ID"]` = `staffMessageId(outboundId)` and persist it as `rfc_message_id` | `ticket-mail.ts` `threadHeaders` 77–84; `tickets-write.ts` 129, 167 | Gmail/Phase 14 match GET `message_id`, not `<s.{uuid}@vamostaxi.site>` |
| Store `suffixOf(id)` (last 12 chars) as thread id | `notify.ts` `suffixOf` 24–26 | Outbox suffix only; not RFC |
| `void from` + hard-coded `CONTACT_FROM` with no staff override | `notify.ts` 37, 41 | D-01 needs `options.from` later; default stays noreply |
| Overlay send failure paints `tLoadError` | `OpsSupportTicket.dc.html` 209–210, 627 | D-07: “Couldn’t send. Try again.” / `sendError` |
| `rejectStaffReply({ reply }) === true` as a write gate | `tickets-map.ts` 30–32; `tickets-map.test.ts` 45–51 | D-12; send path already ignores it |
| Text lockup “Vamos Taxi” / Arial / 180px wordmark | `ConfirmationEmail.tsx` 87–89; `layout.ts` 24, 31 | D-03: 216×30 PNG + Poppins stack |
| Charcoal pill CTA on staff reply (WhatsApp) | `contact.ts` `renderStaffReplyEmail` 190 | D-04: fields the mail needs; do not invent a WhatsApp CTA on a staff reply |
| From `ticket+…@replies…` this phase | ROADMAP Phase 13 criterion 3 | D-01/D-09 gate |
| `app/vamos-i18n-dict.js` for overlay send copy | public-page i18n | Ops overlay uses in-page `T` |
| Touch `app/api/webhooks/resend/route.ts` / `ticket-inbound.ts` | Phase 14 scaffold | Out of scope |

### KEEP as analogs

`withStaff` + Origin CSRF · `jsonOk`/`jsonErr({ ok:false, code })` · dual-mount re-export · `asStaff` Hyperdrive · send-then-insert · `allowEmailFallback: false` + `email` argument `undefined` · `bcc: SUPPORT_EMAIL` · `replyTo: ticketReplyAddress(token)` · `escapeHtml` · four-locale `T` / `COPY` / `messages/*.json` · `sendPriceChanged` skip-send shape · dual-DC sync · empty/closed no-op in `sendReply`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/lib/ops/tickets-write.ts` | service | request-response + CRUD | **this file** `patchTicket` 44–172 | exact — **CHANGE:** GET RFC id; stop mint persist |
| `apps/web/lib/forms/notify.ts` | service | request-response | **this file** `sendContactMessage` 28–82 | exact — **CHANGE:** `emails.get`; optional `from` |
| `apps/web/lib/ops/ticket-mail.ts` | utility | transform | **this file** `ticketReplyAddress` / `threadHeaders` | exact — **CHANGE:** no minted `Message-ID`; add `staffSender` |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` | route | request-response | **this file** PATCH 17–43 | exact — keep `{ reply }` + 503 `send-failed` |
| `apps/web/app/api/staff/tickets/[id]/route.ts` | route | request-response | **this file** re-export | exact — dual-mount, do not fork |
| `apps/web/app/api/contact/route.ts` | route | request-response | **this file** ack send + RFC write 72–141 | exact — **CHANGE:** persist GET id when Resend sent |
| `apps/web/lib/forms/contact-delivery.ts` | service | request-response | **this file** `send` result `{ accepted, providerSuffix }` | exact — **CHANGE:** thread `providerId` to contact route |
| `packages/emails/src/chrome.ts` | config | transform | `lifecycle-mail.tsx` 25–32 | role-match — **NEW** shared hex/fonts/logo |
| `packages/emails/src/layout.ts` | utility | transform | `contact.ts` `voucherHtml` 125–161 | role-match — consume `chrome.ts`; drop Arial; wordmark 216×30 |
| `packages/emails/src/lib/lifecycle-mail.tsx` | component | transform | **this file** envelope | exact — re-export chrome tokens |
| `packages/emails/src/contact.ts` | utility | transform | **this file** `COPY` + `voucherHtml` + `renderStaffReplyEmail` | exact — extend `StaffReplyEmailData`; import chrome |
| `packages/emails/src/ConfirmationEmail.tsx` | component | transform | `lifecycle-mail.tsx` `<Img>` 134–140 | role-match — replace text lockup |
| `packages/emails/src/PayLinkEmail.tsx` | component | transform | `lifecycle-mail.tsx` tokens + Img | role-match — import chrome (already branded) |
| `packages/emails/src/OpsMustFixEmail.tsx` | component | transform | `lifecycle-mail.tsx` Img 134–140 | role-match — import chrome |
| `packages/emails/src/ChauffeurAssignEmail.tsx` | component | transform | same Img family | role-match — import chrome |
| `packages/emails/src/{Cancellation,Reminder24h,AssignmentCustomer,TimeChange,FlightNumber,ReviewRequest,RefundFailed}Email.tsx` | component | transform | `CancellationEmail.tsx` wrapping `LifecycleMail` | exact — inherit chrome; do not add events |
| `packages/emails/src/lib/send.ts` | service | request-response | **this file** `sendReactMail` 123–159 + `sendPriceChanged` 254–258 | exact — From noreply; skip-send on `{key}` sentinel |
| `packages/emails/src/auth.ts` | utility | transform | `layoutHtml` via `renderAuthEmail` 47–68 | exact — chrome via layout |
| `packages/emails/src/refund.ts` | utility | transform | `renderRefundEmail` 70–80 | exact — chrome via layout |
| `packages/emails/index.ts` | config | transform | **this file** contact barrel | exact — export extended `StaffReplyEmailData` |
| `app/ops/OpsSupportTicket.dc.html` | component | request-response | **this file** `sendReply` + `T` | exact — add `sendError`; keep PATCH `{ reply }` |
| `apps/web/public/app/ops/OpsSupportTicket.dc.html` | component | file-I/O | dual-DC generated copy | exact — **do not edit**; sync script |
| `scripts/sync-dc-mock-to-public.mjs` | config | file-I/O | **this file** | exact — **run**, do not patch |
| `apps/web/lib/ops/tickets-map.ts` | utility | transform | **this file** `staffPatchStatus` 16–28 | exact — invert/remove `rejectStaffReply` |
| `apps/web/lib/ops/tickets-write.test.ts` | test | request-response | `coupons.test.ts` `asStaff` mock + `notify.test.ts` Resend mock | role-match — **NEW** Wave 0 |
| `apps/web/lib/forms/notify.test.ts` | test | request-response | **this file** | exact — add GET helper cases |
| `apps/web/lib/ops/ticket-mail.test.ts` | test | transform | **this file** 32–40 | exact — invert Message-ID assertion |
| `apps/web/lib/ops/tickets-map.test.ts` | test | transform | **this file** `rejectStaffReply` 45–51 | exact — invert/remove |
| `packages/emails/src/contact.test.ts` | test | transform | **this file** staff reply 42–53 | exact — name / booking_ref / escape |
| `packages/emails/src/ConfirmationEmail.test.tsx` | test | transform | `OpsMustFixEmail.test.tsx` 38–39 | role-match — assert `wordmark-email.png` |
| `packages/emails/src/lib/send.test.ts` | test | request-response | **this file** fail-closed 67–77 | exact — optional skip-send |
| `packages/emails/src/auth.test.ts` | test | transform | **this file** rtl + escape | exact — assert no Arial after layout pass |
| `apps/web/lib/ops/ops-live-data.test.ts` | test | file-I/O | **this file** Support grep 74–83 | exact — add `sendError` four langs |
| `app/vamos-i18n-dict.js` | store | transform | — | **skip** — overlay `T`, not public dict |

---

## Pattern Assignments

### Family 1 — Staff PATCH contract (`route`, request-response)

**Analog:** `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts`

**Keep this contract.** Planner must not add a reply sub-route.

**Imports + auth wrapper** (lines 5–17):

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { patchTicket } from "@/lib/ops/tickets-write";

export const dynamic = "force-dynamic";

export const PATCH = withStaff(async (claims, request) => {
```

**Body parse + `{ reply }`** (lines 20–42):

```typescript
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErr("invalid-json", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonErr("invalid-json", 400);
  }
  const record = body as { status?: unknown; reply?: unknown };
  const input: { status?: string; reply?: string } = {};
  if (typeof record.status === "string") input.status = record.status;
  if (Object.prototype.hasOwnProperty.call(record, "reply")) {
    input.reply = typeof record.reply === "string" ? record.reply : "";
  }
  const { env } = getCloudflareContext();
  const result = await patchTicket(env, claims, id, input);
  if (!result.ok) {
    if (result.reason === "not-found") return jsonErr("not-found", 404);
    if (result.reason === "send-failed") return jsonErr("send-failed", 503);
    return jsonErr(result.reason, 400);
  }
  return jsonOk({ id, status: result.status });
```

Copy CSRF/auth from `apps/web/lib/ops/staff-json.ts` lines 23–78 — do not rewrite:

```typescript
export function jsonErr(code: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, code, ...(extra ?? {}) }, { status });
}
export function withStaff(handler: StaffJsonHandler): (request: Request) => Promise<Response> {
  return (request) => staffResponse(request, requireStaffClaims, handler);
}
```

Non-GET already rejects foreign `Origin` (`staffOriginAllowed`, lines 34–43, 68–71). Do not put Resend payloads in `jsonErr` extras (D-07).

**Dual-mount analog** — copy `apps/web/app/api/staff/tickets/[id]/route.ts` lines 1–2 as-is:

```typescript
export const dynamic = "force-dynamic";
export { PATCH } from "../../../../[locale]/(ops)/api/staff/tickets/[id]/route";
```

---

### Family 2 — Send-then-insert (`tickets-write.ts` + `notify.ts`)

**Analog:** `apps/web/lib/ops/tickets-write.ts` (keep shape, fix identity)

**Imports** (lines 6–11):

```typescript
import { renderContactCustomerEmail, renderStaffReplyEmail } from "@vamos/emails";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { sendContactMessage } from "@/lib/forms/notify";
import { SUPPORT_EMAIL } from "@/lib/contact-channels";
import { contactMessageId, ticketReplyAddress, threadHeaders } from "@/lib/ops/ticket-mail";
import { staffPatchStatus, type TicketStatus } from "@/lib/ops/tickets-map";
```

After `staffSender` exists, import that instead of composing From by hand. Keep `SUPPORT_EMAIL` from `apps/web/lib/contact-channels.ts` line 15 — never hard-code a second `info@`.

**Empty / closed gates** (copy lines 50–52, 117–118):

```typescript
  const hasReply = Object.prototype.hasOwnProperty.call(input, "reply");
  const reply = typeof input.reply === "string" ? input.reply.trim() : "";
  if (hasReply && !reply) return { ok: false, reason: "empty-reply" };
  // …
  if (current === "closed") return { ok: false, reason: "invalid-status" };
```

Enforce 1…8000 **before** Resend (DB check exists; fail early to avoid send-without-row). Locale allow-list: copy `asEmailLocale` lines 21–25.

**Send call to keep, then extend** (lines 132–146):

```typescript
  const sent = await sendContactMessage(
    env.RESEND_API_KEY,
    undefined,
    to,
    `staff-reply/${id}/${outboundId}`,
    rendered,
    undefined, // never env.EMAIL
    {
      headers, // In-Reply-To + References only after threadHeaders change
      replyTo,
      bcc: SUPPORT_EMAIL,
      allowEmailFallback: false,
    },
  );
  if (!sent.accepted || !sent.providerId) return { ok: false, reason: "send-failed" };
```

**CHANGE (do not copy):** lines 123–129 mint `threadHeaders(..., outboundId)` then `rfcId = headers["Message-ID"]`. After send, persist GET `message_id` as `rfc_message_id` and `sent.providerId` as `resend_email_id`. Fail closed if GET has no RFC id (retry GET once). Subject: keep `Re: ${ackSubject}` from `renderContactCustomerEmail` (lines 126–128, D-02). Pass customer `name` + `booking_ref` into `renderStaffReplyEmail` once the type grows — load them in the same SELECT as `email` / `locale` / `reply_token` (lines 89–99).

**Insert-after-accept** (copy lines 148–171, swap `${rfcId}` for GET id):

```typescript
  return asStaff(env, claims, async (sql) => {
    await sql`update public.contact_submissions set ticket_status = 'replied', …`;
    await sql`insert into public.support_messages (… resend_email_id, rfc_message_id) values (… 'outbound_staff', …)`;
    return { ok: true as const, status: "replied" as const };
  });
```

Status `replied` stays send-path only. Copy `staffPatchStatus` (`tickets-map.ts` 16–28) which already refuses client `replied`/`responded`.

---

**Analog:** `apps/web/lib/forms/notify.ts`

**Keep fail-closed staff path** (lines 12–13, 39, 50–62):

```typescript
  allowEmailFallback?: boolean;
  const allowEmailFallback = options?.allowEmailFallback !== false;
  const result = await new Resend(apiKey).emails.send(payload, { idempotencyKey });
  const id = result.data?.id;
  if (!result.error && typeof id === "string" && id.length > 0) {
    return { accepted: true, providerSuffix: suffixOf(id), providerId: id };
  }
  if (!allowEmailFallback) {
    return { accepted: false, providerSuffix: null, providerId: null };
  }
```

Empty `catch` (lines 57–59) is intentional — do not `console.log` To/body/key.

**CHANGE:** after `emails.send` succeeds, call `resend.emails.get(id)`. Persist `data.message_id` (RFC, angle-bracketed) separately from UUID `id`. Retry GET once if `message_id` empty, then fail closed. Do not treat `suffixOf(id)` as RFC. Add `options.from` (staff) but default `CONTACT_FROM` (`notify.ts` line 5) so contact ack is unchanged.

Return shape today is `{ accepted, providerSuffix, providerId }`. Add `rfcMessageId` (or a sibling helper `retrieveRfcMessageId(apiKey, id)`) so `tickets-write` and contact ack can share GET. `providerSuffix` stays for `contact_delivery` finalize.

**Contact ack EMAIL fallback stays** (lines 64–80). D-08. Do not force Resend-only on POST `/api/contact`.

---

**Analog for GET persist on ack:** `apps/web/app/api/contact/route.ts` lines 72, 101–111, 129–141

```typescript
  const rfcId = contactMessageId(submissionId);
  send: (message, providerIdempotencyKey) => sendContactMessage(
    apiKey, from, …,
    message === "customer"
      ? { replyTo, headers: { "Message-ID": rfcId } }
      : undefined,
  ),
  if (delivery.accepted) {
    await asSystem(env, (tx) => tx`
      update public.support_messages
      set rfc_message_id = ${rfcId}
      where submission_id = ${submissionId}::uuid
        and direction = 'inbound_form'
        and (rfc_message_id is null or rfc_message_id = '')
    `);
```

**CHANGE:** when customer ack `providerId` is a Resend UUID, GET and store that `message_id` instead of synthetic `contactMessageId`. Drop custom `Message-ID` header on the Resend ack (provider ignores/overwrites). If ack used EMAIL, keep synthetic id (best-effort). Extend `contact-delivery.ts` line 10 `send()` result to pass `providerId` through — today only `providerSuffix` is finalized.

---

**Lifecycle fail-closed analog** (same family, different package): `packages/emails/src/lib/send.ts` `sendReactMail` 123–159

```typescript
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const result = await resend.emails.send({
      from: FROM, // "Vamos Taxi <noreply@vamostaxi.site>" line 110
      to: unique,
      subject, react, text,
    });
    if (result.error) return { ok: false, error: result.error.message };
    const id = result.data?.id;
    if (!id) return { ok: false, error: "Resend returned no id" };
    return { ok: true, providerMessageId: id };
```

Copy From `noreply@`. Copy `LIFECYCLE_OPS_EMAIL` line 116 — never `info@` except staff BCC. Skip-send analog: `sendPriceChanged` lines 254–258 `{ ok: true, skipped: true }`. Before `emails.send`, if `t()` returned `` `{${key}}` `` (`packages/emails/src/lib/t.ts` line 40) or `coverage()` is non-empty for required keys, return skip — do not invent DE/FR/AR.

---

### Family 3 — RFC threading without minted Message-ID (`ticket-mail.ts`)

**Analog:** `apps/web/lib/ops/ticket-mail.ts`

**Keep plus-address** (lines 8–16, 26–30):

```typescript
export const REPLY_MAILBOX_HOST = "replies.vamostaxi.site";
export const CONTACT_FROM = "Vamos Taxi <noreply@vamostaxi.site>";

export function ticketReplyAddress(token: string): string {
  return `ticket+${token}@${REPLY_MAILBOX_HOST}`;
}

export function asRfcMessageId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return ANGLE.test(value) ? value : `<${value}>`;
}
```

**CHANGE `threadHeaders`** (current 77–84 — do not copy the `Message-ID` assignment):

```typescript
export function threadHeaders(inReplyTo: string, outboundId: string): Record<string, string> {
  const parent = asRfcMessageId(inReplyTo);
  const child = staffMessageId(outboundId);
  return {
    "Message-ID": child,       // DELETE this key
    "In-Reply-To": parent,
    References: `${parent} ${child}`, // CHANGE: References = prior RFC ids only, no minted child
  };
}
```

Target shape (Resend reply-to-emails guide): `{ "In-Reply-To": parentRfcId, References: chain }`. Keep `In-Reply-To` = oldest stored `rfc_message_id` (today `tickets-write.ts` 103–112 `limit 1` oldest). Persist the new GET id so the next reply can extend `References`. Keep `staffMessageId` only if Phase 14 tests still import it — stop using it on the send path.

**Add D-01 sender helper in this file** (no analog function exists; compose from `CONTACT_FROM` + `ticketReplyAddress`):

```typescript
export const REPLIES_DOMAIN_VERIFIED = false; // flip only after owner D-01

export function staffSender(token: string): { from: string; replyTo: string } {
  const plus = ticketReplyAddress(token);
  if (REPLIES_DOMAIN_VERIFIED) {
    return { from: `Vamos Taxi <${plus}>`, replyTo: plus };
  }
  return { from: CONTACT_FROM, replyTo: plus };
}
```

Do not parse inbound here this phase (`parseTicketReplyToken` / `readInboundPayload` stay for Phase 14).

---

### Family 4 — Email chrome (`lifecycle-mail.tsx` canonical)

**Analog (lift into NEW `packages/emails/src/chrome.ts`):** `packages/emails/src/lib/lifecycle-mail.tsx` lines 25–32

```typescript
export const CHARCOAL = "#1E1F1F";
export const GREY = "#DEDEDE";
export const MUTED = "#545756";
export const YELLOW = "#FDC20B";
export const WHITE = "#FFFFFF";
export const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
export const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';
export const LOGO = "https://vamostaxi.site/brand/logo/wordmark-email.png";
```

Also export `LOGO_WIDTH = 216`, `LOGO_HEIGHT = 30`. Yellow is a 4px bar + primary CTA fill only. No `--vt-yellow-50`. No glow. No Arial.

**Wordmark `<Img>` analog** — copy `lifecycle-mail.tsx` 134–140 (and yellow bar 163–165) into `ConfirmationEmail.tsx` replacing the text lockup at 87–89:

```tsx
            <Img
              src={LOGO}
              width={216}
              height={30}
              alt="Vamos Taxi"
              style={{ display: "block", border: "0", outline: "none", width: "216px", height: "30px" }}
            />
          …
          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>
```

Same Img already lives in `PayLinkEmail.tsx` 168–174, `OpsMustFixEmail.tsx`, `ChauffeurAssignEmail.tsx` — point those local `const CHARCOAL/LOGO` at `chrome.ts` instead of forking hex.

**HTML envelope analog (contact family, already correct size):** `packages/emails/src/contact.ts` `voucherHtml` 125–161

```typescript
<body style="margin:0;padding:0;background:${GREY};color:${CHARCOAL};font-family:${BODY_FONT};">
…
            <img src="${LOGO}" width="216" height="30" alt="Vamos Taxi" style="display:block;width:216px;height:30px;border:0;outline:none;"/>
…
          <td style="height:4px;line-height:4px;font-size:0;background:${YELLOW};">&nbsp;</td>
```

**CHANGE `layout.ts`** (current 12–32 uses Arial + 180px). Point at `chrome.ts`. Copy contact voucher metrics (216×30, `BODY_FONT`), keep table envelope + `dir` from locale (`layout.ts` 13). `ctaButton` (60–67) already yellow fill + charcoal type — keep; swap Arial for `BODY_FONT`. Auth (`auth.ts` 47–68) and refund (`refund.ts` 70–80) consume `layoutHtml` — they inherit the pass. Do not rewrite them to React this phase.

**Staff reply fields analog:** extend `packages/emails/src/contact.ts` types 13 + renderer 183–194.

Today:

```typescript
export type StaffReplyEmailData = { reply: string };
export function renderStaffReplyEmail(locale: EmailLocale, data: StaffReplyEmailData) {
  const copy = COPY[locale];
  return {
    subject: `Re: ${copy.customerSubject}`,
    html: voucherHtml(locale, `${headingHtml(copy.staffHeading)}${mutedHtml(copy.staffBody)}`,
      `${kickerHtml(copy.staffQuoteLabel)}${quoteHtml(data.reply)}${charcoalPill(WHATSAPP_HREF, copy.customerCta)}`),
```

D-02: subject must stay `Re:` the **customer-ack** subject (`COPY.customerSubject`) — already this. D-04: add `name` + optional `bookingRef`; omit the booking chip when empty. Escape via `escapeHtml` (`packages/emails/src/escape.ts` 2–8) — the only concatenative HTML escape. Drop the WhatsApp charcoal pill from the **staff** template (ack may keep it). Export the extended type from `packages/emails/index.ts` lines 3–4.

**Lifecycle template analog:** `packages/emails/src/CancellationEmail.tsx` 30–46 wraps `LifecycleMail` + `Fact` + `t(locale, key)`. Reminder/assign/time/flight/review/refund-failed follow the same file. Brand pass is chrome import inside `LifecycleMail`, not new funnel events.

**i18n analog:** `packages/emails/src/lib/t.ts` 33–45 (`{${key}}` sentinel) and `coverage()` 48–60. Overlay strings do **not** go here; they go in OpsSupportTicket `T`.

---

### Family 5 — Overlay Send + dual-DC + tests

**Analog:** `app/ops/OpsSupportTicket.dc.html`

**Keep Send contract** (lines 562–590):

```javascript
  sendReply = () => {
    const body = String(this.state.draft || '').trim();
    const id = this.state.openId;
    if (!body || !id || this.state.sending) return;
    const current = this.state.tickets.find((t) => t.id === id);
    if (current && current.status === 'closed') return;
    this.setState({ sending: true, overlayError: false });
    api.request('PATCH', '/api/staff/tickets/' + id, { reply: body }).then((json) => {
      if (!json || json.ok !== true) {
        this.setState({ sending: false, overlayError: true });
        return;
      }
      // optimistic staff line + status replied, then hydrate
```

Keep empty/closed/`sending` no-ops (`sendOff` line 698). Keep `json.ok` check — do not surface `code: "send-failed"` in the overlay.

**CHANGE copy:** overlay error node 209–210 currently `{{ tLoadError }}`. Add `sendError` to `T` (en/de/fr/ar, same sitting as `loadError` at 310/324/338/352) and a `tSendError` in `renderVals` (627). English: “Couldn’t send. Try again.” Swiss German “ss” not “ß”. Do not put new overlay strings in `app/vamos-i18n-dict.js`.

**Four-language `T` analog** (copy structure 303–359): every new key in `en`, `de`, `fr`, `ar` in the same pass.

**Dual-DC analog:** `scripts/sync-dc-mock-to-public.mjs` lines 1–8, 22–47 (`PAGE_FILES` includes `app/ops/ops.dc.html` only — ticket board is copied recursively with `app/`). After HTML change: `node scripts/sync-dc-mock-to-public.mjs`. Byte-equal assertion analog: `apps/web/lib/ops/ops-pricing-vat-field.test.ts` 16–17, 37–40:

```typescript
const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");
expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(readFileSync(CANONICAL, "utf8"));
```

Swap paths to `OpsSupportTicket.dc.html`. Do not strip injected `<base>` on `ops.dc.html`. Grep tests already read the writer: `ops-live-data.test.ts` 74–83.

---

**Wave 0 test analogs**

| New/extended test | Copy from |
|-------------------|-----------|
| `apps/web/lib/ops/tickets-write.test.ts` **NEW** | `coupons.test.ts` 9–32, 66–74 (`vi.mock` `asStaff`, `VamosClaims` dispatcher); `notify.test.ts` 6–12 Resend `vi.mock` — add `emails.get` on the mock class |
| `notify.test.ts` GET helper | **this file** 35–47 headers/replyTo; 59–73 `allowEmailFallback: false` + bcc `info@vamostaxi.site` — keep; add get-then-rfc vs UUID vs `staffMessageId` |
| `ticket-mail.test.ts` | **this file** 32–40 — invert: `headers` must **not** contain `Message-ID`; `In-Reply-To` stays parent |
| `tickets-map.test.ts` | 45–51 — delete or invert `rejectStaffReply` (“rejects any reply key this slice”) |
| `contact.test.ts` | 42–53 locale loop + XSS `unsafe` — add name, booking_ref present/absent, still `subject.startsWith("Re: ")` |
| `ConfirmationEmail.test.tsx` | `OpsMustFixEmail.test.tsx` 38–39 `toContain("wordmark-email.png")` + `"#FDC20B"`; keep `coverage() === []` in Confirmation test 41–44 |
| `auth.test.ts` | 30–37 rtl — add `not.toMatch(/Arial/)` after layout pass |
| `ops-live-data.test.ts` | 74–83 — grep writer for `sendError` in all four `T` langs; send error ≠ `loadError` |
| `send.test.ts` | 67–71 Resend error → `ok: false` never throws |

Vitest include is `apps/web/lib/**/*.test.ts` — **do not** put Wave 0 tests under `apps/web/tests/unit/`.

`asStaff` mock skeleton to copy (`coupons.test.ts` 9–32, 71–74):

```typescript
const asStaff = vi.fn();
vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));
const claims: VamosClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};
asStaff.mockImplementation(async (_env, _claims, fn) => fn(sql));
```

Resend mock skeleton (`notify.test.ts` 6–12) — extend with `get`:

```typescript
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendResend, get: getResend };
  },
}));
```

Assert stored RFC matches `/^<.+@.+>$/` and is **not** `staffMessageId()` and **not** equal to `providerId`.

---

## Shared Patterns

### Authentication / CSRF
**Source:** `apps/web/lib/ops/staff-json.ts` 33–78
**Apply to:** staff ticket PATCH (already wrapped). Do not add a second auth stack. Browser must not hold `RESEND_API_KEY`.

### Error envelope
**Source:** `jsonErr` `staff-json.ts` 27–28; overlay `json.ok !== true` → `overlayError`
**Apply to:** empty-reply 400, closed 400, send-failed 503 with `{ ok: false, code: "send-failed" }` only. No Resend JSON.

### Staff DB door
**Source:** `asStaff` in `tickets-write.ts` 88–114, 148–171
**Apply to:** load ticket + insert `support_messages`. Anon remains revoked (Phase 12).

### Fail-closed Resend
**Source:** `notify.ts` 59–62; `send.ts` 132–153
**Apply to:** staff reply and lifecycle sends. Contact ack may still `EMAIL` (`notify.ts` 64–80).

### Addresses
**Source:** `contact-channels.ts` 15, 24; `send.ts` 110, 116
**Apply to:** BCC `SUPPORT_EMAIL`; lifecycle ops `BOOKINGS_OPS_EMAIL` / `LIFECYCLE_OPS_EMAIL`; From `noreply@vamostaxi.site`.

### HTML escape
**Source:** `packages/emails/src/escape.ts` 2–8; contact `quotedMessageHtml` 95–97
**Apply to:** staff body, customer name, booking ref in HTML mail.

### Dual-DC
**Source:** `scripts/sync-dc-mock-to-public.mjs`; `ops-pricing-vat-field.test.ts` 37–40
**Apply to:** `OpsSupportTicket.dc.html` only as writer.

### Four languages same pass
**Source:** OpsSupportTicket `T` 303–359; `contact.ts` `COPY` 40–93; `t.ts` + `messages/{en,de,fr,ar}.json`
**Apply to:** `sendError`, staff-reply COPY fields, any new `t()` keys. Arabic `dir="rtl"` already in `voucherHtml` / `LifecycleMail`.

---

## No Analog Found

| File / capability | Role | Data Flow | Reason |
|-------------------|------|-----------|--------|
| `resend.emails.get(id)` → RFC `message_id` | service | request-response | No in-repo `emails.get` call. Implement **inside** `notify.ts` using the existing `new Resend(apiKey)` from lines 50–55. Official retrieve: GET body has `message_id` (angle-bracketed) beside UUID `id`. Retry once, then fail closed. |
| `packages/emails/src/chrome.ts` | config | transform | New file. Not greenfield — lift `lifecycle-mail.tsx` 25–32. |
| `app/vamos-i18n-dict.js` | store | transform | **Out of path.** Overlay copy is OpsSupportTicket `T`. Do not add send-error strings to the public dict this phase. |

---

## Metadata

**Analog search scope:** `apps/web/lib/{forms,ops}`, `apps/web/app/[locale]/(ops)/api/staff/tickets`, `apps/web/app/api/{staff/tickets,contact}`, `packages/emails/src/**`, `app/ops/OpsSupportTicket.dc.html`, `scripts/sync-dc-mock-to-public.mjs`, `apps/web/lib/contact-channels.ts`, Wave 0 `*.test.ts(x)`.
**Files scanned:** ~55 (emails package 34 + staff ticket routes + notify/ticket-mail/write + overlay + listed tests)
**Pattern extraction date:** 2026-09-15
**Stopped at:** 5 families (staff PATCH, send-then-insert, RFC helpers, chrome, overlay/tests)

**Planner must-nots (from RESEARCH):** no `POST /api/quote`, no Staff tab, no `vamostaxi.eu`, no `env.production`, no push `main`, no inbound MX, no attachments, no `sk_live_`.
