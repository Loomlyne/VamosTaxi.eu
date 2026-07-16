# Decisions

## Confirmed

1. Koussay will build the product himself with AI assistance.
2. Target delivery is no more than one month.
3. Build a pre-booked transfer website plus operations dashboard, not an Uber clone.
4. Transfeero is a product and UX reference, not a request to reproduce its global marketplace.
5. Responsive web comes before native applications.
6. Manual dispatcher assignment is sufficient for V1.
7. Use Next.js, TypeScript, Tailwind and shadcn/ui.
8. Use Supabase as the primary database, auth and storage platform.
9. Use Vercel for deployment.
10. Use Stripe for online payment, subject to final business-account eligibility and method confirmation.
11. Use Google Places and Routes for addresses, distance and duration.
12. Use Resend for transactional email.
13. Begin from a clean MIT-compatible starter, not Medusa.
14. Open-source research must be evaluated by required feature coverage, workflow fit, licence clarity, maintenance, security and build quality.
15. Restaurant menu material is unrelated and must never be included in Vamos Taxi.

## Recommended but awaiting confirmation

- Launch with guest checkout and secure manage-booking links instead of mandatory customer accounts.
- Launch with English and German first.
- Use CHF as the primary currency.
- Collect flight numbers but postpone automated flight-status integration.
- Support transfer, return transfer, cash and Stripe/TWINT in V1.
- Move Supabase to Pro before accepting production bookings.
