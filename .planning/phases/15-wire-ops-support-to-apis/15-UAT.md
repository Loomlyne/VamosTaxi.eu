---
status: testing
phase: 15-wire-ops-support-to-apis
source:
  - 15-01-SUMMARY.md
  - 15-02-SUMMARY.md
  - 15-03-SUMMARY.md
started: 2026-09-18T03:30:00+04:00
updated: 2026-09-18T03:30:00+04:00
---

## Current Test

number: 1
name: Open Support from dashboard
expected: |
  Dashboard Support board loads. Overlay CTA reads Save (en). No Staff tab.
awaiting: user response

## Tests

### 1. Open Support from dashboard
expected: https://dashboard.vamostaxi.site/ then Support. Board loads. Save label. No Staff.
result: pending

### 2. Overlay Save persists phone + booking ref + note
expected: Open a ticket. Change phone and/or booking ref. Click Save. Reload Support. Values still there. Empty note still Save.
result: pending

### 3. Badge counts New + Responded
expected: Sidebar Support badge equals tickets in New plus Responded, not New only.
result: pending

### 4. Files stay in the message bubble
expected: A ticket with an attachment shows the file in the thread bubble (image or filename link). Body text stays text.
result: pending

### 5. Mail / Call / WhatsApp unchanged
expected: Overlay still has mailto, tel, and wa.me/41796267082. No innerHTML.
result: pending

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

[]
