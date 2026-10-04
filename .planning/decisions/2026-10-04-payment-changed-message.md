# Decision: dashboard message for "payment-changed"

Owner, question form, 2026-10-04 18:08 +0400. Answer: "With reason".

When Refund, Accept, a class change or a trip change runs in the same instant a payment for that booking settles,
the database refuses with `payment-changed` (SQLSTATE 40001, migration 20261007280000) and writes nothing.
The dashboard error box shows, in English, word for word:

> This booking's payment was being recorded at the same time, so nothing was changed. Press the button again.

German (Swiss, "ss"), French and Arabic are translated from this sentence in the register of the neighbouring
dashboard errors. Job: `fix/payment-changed-message` (quick 261004-payment-changed-message).

Options he was shown: "Short" (recommended), "Shorter", "With reason" (chosen).
