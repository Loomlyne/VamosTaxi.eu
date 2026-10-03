# Booking pages polish: the owner's answer (question form, 2026-10-02 about 15:30 +04)

Job `261002-booking-pages-polish`, branch `fix/booking-pages-polish`. Pictures in
`.planning/quick/261002-booking-pages-polish/screens/` (sheets 1-4). Plan: `PLAN.md` in the same folder.

| # | Question (example) | His answer |
|---|---|---|
| D1 | The four sheets and the plan: Amira Keller signed in opens her paid booking VT-26-0807 on /booking-detail and sees "Confirmed" plus a Cancel tile (today "Awaiting payment", no Cancel); German reads "Di. 6. Okt. · 08:15"; Arabic reads حقيبتان for 2 bags and the time picker 18 : 30; a refunded booking stops offering Cancel on the e-mail link page too; no migration, no price change | "Signed, build it" |

Notes:
- Item 5 here is the DC picker (`app/home/WhenPicker.dc.html`, `app/pages/WhenPicker.dc.html`). The React
  `apps/web/components/forms/TimePicker.tsx` is a separate job (`fix/arabic-time-spinner`), not this one.
- The picker footer on a phone puts the summary on its own line above Reset / Time set (sheet 4, German after).
