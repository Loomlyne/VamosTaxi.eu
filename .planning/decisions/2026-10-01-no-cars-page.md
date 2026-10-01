# Owner decision: no cars on the dashboard; chauffeurs by class (2026-10-01)

The owner's words of 2026-10-01, in the order he said them. Recorded by the 26.2 chauffeur job
(branch `gsd/26.2-chauffeur-car`, record `.planning/quick/261001-chauffeur-car/RECORD.md`).

## Decisions

1. "No cars tab. No fleet. Only chauffeurs, and their data needs to be there, that's it."
2. The Cars page is withdrawn. Branch `gsd/26.2-cars-page` is kept as an archive only and is never
   merged.
3. The car-of-the-driver idea (each driver has his own car; the chauffeur form carries the car) is
   withdrawn.
4. Assign never needs a car. A trip is assigned to a driver only; `booking_legs.assigned_vehicle_id`
   stays empty.
5. His sentence, verbatim: "No each chauffeur will be chosen by a class thats it without anything extra So i cab assign him easilly on bookings"
6. His words, verbatim: "Keep the form of the chauffeur as it was before. The car form inside chauffeur remove it. I only can choose a class and a plate number (that what will differentiate drivers and keep track on them). When I assign a driver the driver that appear must match the request of the class. And keep a history on each chauffeur of his bookings logs."

## What follows from it

- The chauffeur form is the form as it was before the 2026-10-01 dashboard-design ship (with the
  Class field: the classes of the live price book), plus one field: Plate number. No car field.
- The plate is stored on the chauffeur (`chauffeurs.plate`). Where a customer or a mail showed the
  car's plate, it now shows the chauffeur's plate; the car model is shown nowhere.
- Assign on a booking lists only the drivers of the booking's class; the server refuses a driver of
  another class.
- Capacity is checked against the class (passengers and bags of the class), not a car.
- Each chauffeur's profile keeps a read-only history of every booking he was assigned to.
- No vehicle row is created, changed or deleted by this work; the existing unused vehicle row on
  live stays as it is.
