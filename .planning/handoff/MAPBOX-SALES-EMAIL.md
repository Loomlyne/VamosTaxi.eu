# Mapbox sales email — send when the Mapbox account is created

**From:** the owner (billing on the Mapbox account)
**To:** Mapbox sales (account signup / contact-sales)
**Why:** Product Terms §2.10.1 and §2.7.2 bar caching or storing Directions/geocode
results on the self-serve plan. We need an Order clause. ADR-014 Q5.

---

Subject: Contract cover for stored route distance on paid airport-transfer bookings

Hello,

We are building Vamos Taxi (vamostaxi.eu), a Swiss pre-booked airport-transfer
service (Zurich first). Customers get a fixed-price quote, pay online, and a
chauffeur meets them at the agreed pickup.

We use Mapbox Search Box, Geocoding, and Directions to price a booking.

**We store route distance, duration, and pickup/dropoff coordinates permanently
on a paid transportation booking record.** We also need those duration minutes
for chauffeur/vehicle scheduling. We do **not** cache Mapbox responses in KV
for reuse across customers unless that is also allowed.

Please confirm this use is covered by contract (an Order that carves it out of
Product Terms §2.10.1 / §2.7.2). We will not go live on self-serve terms that
forbid storing the route on the booking.

Thank you,
[name]
Vamos Taxi · Zürich
contact@vamostaxi.eu

---

Do not send until the Mapbox account exists (owner creates it when asked).
Until a written Order lands: live Mapbox every quote, no KV cache of Mapbox
output.
