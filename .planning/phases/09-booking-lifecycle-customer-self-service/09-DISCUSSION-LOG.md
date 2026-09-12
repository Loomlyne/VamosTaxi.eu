# Phase 9: Booking Lifecycle & Customer Self-Service - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 09-booking-lifecycle-customer-self-service
**Areas discussed:** Cancel + refund, Reviews, Flight delay, Mails, No-show, Same ticket, Ops time-change, Status word, Complete/no-show actor, Review photo, Flight number, Confirm copy, Legal, Chauffeur mail lang, Dash period, Unpaid link, Dash money cards, Ops mailbox, Double time-change, Chauffeur mail timing

---

## Cancel + refund

Owner free text overrode LIFE-02 75% auto: **>24h auto 100%; 24h–6h Ops default 100%; 6h–pickup 0; after pickup cancel allowed 0; Ops can refund anyone anytime.** Unpaid hard-delete. Same ticket after cancel. Stripe payer. Captured amount including VAT. Coupon 100→80. Calendar slot free. No undo. Ticket-only Cancel. Zurich original pickup clock. On-shift → urgent Ops ping. Admin-only V1. Remaining balance refunds until 0. Failed Stripe stays cancelled + Ops email.

## Reviews

Email `/review` + completed ticket + profile notification. Stars + optional comment then expanded to company/chauffeur/overall. Ops publish. First name public. One selfie photo optional, public when published. Forever link, one submit. Can review paid/refunded/completed/paid no-show; not unpaid/cancelled.

## Flight delay

Customer and Ops enter time; live only after Ops confirm on booking detail + dash ping. Refuse → original + mail. Clocks stay on **original** pickup. Latest pending request wins. Flight number edit anytime, mail Ops + chauffeur.

## Mails

Assign immediately. 24h vs original Zurich. Unassigned: reminder without driver + ping Ops; if assigned by then, also driver-details mail. After 24h: assignment mail only. Copies to `bookings@vamostaxi.site`.

## Other

No auto no-show sweep. Same ticket two URLs. Status always Cancelled + refund line. Ops-only Completed/No-show. Confirm copy set A. Legal must be real data. Dash refunds in Expenses; filters today/week/month/all.

## Claude's Discretion

None.

## Deferred Ideas

AeroDataBox; auto no-show sweep; Phase 17; 13–16; 10–11; MX for bookings@; SMS.
