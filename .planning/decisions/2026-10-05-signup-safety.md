# Sign-up safety — owner decisions (2026-10-05, question form)

Open items S5 and S9 of `.planning/audits/2026-10-05-repo-investigation.md` after the security hardening ship (`43fba58d`).

| # | Question | Answer (verbatim choice) |
|---|---|---|
| 1 | Sign-up and "forgot password" on /sign-in have no human check; add the same "Verify you are human" check the booking uses? | "Yes, add it (Recommended)" |
| 2 | The sign-up confirmation email greets by the typed name before the address is confirmed. What should it do? | "No greeting until confirmed (Recommended)": start without the name, like the sign-in email; no new wording |
| 3 | Two bookings, two manage links: which booking does the manage page show? | "The last link opened (Recommended)": no change |
| 4 | "Email me a sign-in link" also creates an account for a new address and mails it with no human check. What should it do? | "Same human check for new addresses (Recommended)": existing customers sign in as today; a new address gets the invisible check before the email; no new words |
